import { randomUUID } from 'node:crypto';
import { runCode, valuesEqual } from '../runner.mjs';

const MIN_TESTS = 6;
const MAX_TESTS = 16;
const MAX_ARGUMENT_BYTES = 50_000;

function compactProblem(problem, includeReference = false) {
  return JSON.stringify({
    title: problem.title,
    category: problem.category,
    parameters: problem.parameters,
    description: problem.description.slice(0, 24_000),
    ...(includeReference ? { importedReferenceSolution: problem.source.slice(0, 24_000) } : {}),
  }, null, 2);
}

function normalizeCode(value) {
  return String(value || '')
    .replace(/^```(?:python)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function normalizeCandidates(payload, parameterCount) {
  const seen = new Set();
  const raw = Array.isArray(payload?.cases) ? payload.cases : [];
  const result = [];
  for (const candidate of raw) {
    const args = Array.isArray(candidate) ? candidate : candidate?.args;
    if (!Array.isArray(args) || args.length !== parameterCount) continue;
    let serialized;
    try { serialized = JSON.stringify(args); } catch { continue; }
    if (serialized.length > MAX_ARGUMENT_BYTES || seen.has(serialized)) continue;
    seen.add(serialized);
    result.push({
      args,
      label: String(candidate?.label || `Case ${result.length + 1}`).slice(0, 80),
      category: String(candidate?.category || 'general').slice(0, 40),
    });
    if (result.length >= MAX_TESTS) break;
  }
  return result;
}

async function verifyWithReference(problem, candidates) {
  if (!candidates.length) return [];
  const execution = await runCode('python', problem.source, candidates.map(({ args }) => ({ args })));
  return candidates.flatMap((candidate, index) => {
    const result = execution.results?.[index];
    if (!result?.ok || result.value === undefined) return [];
    return [{ ...candidate, expected: result.value }];
  });
}

function uniqueTests(tests) {
  const seen = new Set();
  return tests.filter((test) => {
    const key = JSON.stringify(test.args);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertSafePython(code) {
  if (!/^\s*def\s+solution\s*\(/m.test(code)) throw new Error("Generated code did not define 'solution(...)'.");
  if (code.length > 30_000) throw new Error('Generated solution was unexpectedly large.');
  const unsafe = [
    /\b(?:import|from)\s+(?:os|sys|subprocess|socket|pathlib|shutil|requests|urllib)\b/,
    /\b(?:open|exec|eval|compile|__import__)\s*\(/,
    /\b(?:globals|locals|vars)\s*\(/,
  ];
  if (unsafe.some((pattern) => pattern.test(code))) throw new Error('Generated code requested unsafe system capabilities.');
}

async function verifySolution(problem, code, tests) {
  try { assertSafePython(code); } catch (error) { return { passed: false, error: error.message, failures: [] }; }
  const execution = await runCode('python', code, tests.map(({ args }) => ({ args })));
  const failures = tests.flatMap((test, index) => {
    const result = execution.results?.[index];
    if (result?.ok && valuesEqual(result.value, test.expected)) return [];
    return [{
      args: test.args,
      expected: test.expected,
      actual: result?.value,
      error: result?.error || execution.error,
    }];
  });
  return { passed: failures.length === 0 && tests.length > 0, failures, error: execution.error };
}

function solutionFromPayload(payload) {
  return {
    code: normalizeCode(payload?.code),
    explanation: String(payload?.explanation || '').slice(0, 12_000),
    timeComplexity: String(payload?.timeComplexity || 'Not provided').slice(0, 200),
    spaceComplexity: String(payload?.spaceComplexity || 'Not provided').slice(0, 200),
  };
}

function sumUsage(responses) {
  return responses.reduce((total, response) => ({
    prompt_tokens: total.prompt_tokens + Number(response?.usage?.prompt_tokens || 0),
    completion_tokens: total.completion_tokens + Number(response?.usage?.completion_tokens || 0),
    total_tokens: total.total_tokens + Number(response?.usage?.total_tokens || 0),
  }), { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
}

export class AiGenerator {
  constructor({ client, stateStore }) {
    this.client = client;
    this.stateStore = stateStore;
  }

  ensureSupported(problem) {
    if (problem.editorLanguage !== 'python' || !problem.parameters.length) {
      const error = new Error('AI generation currently requires a Python problem with a solution(...) signature.');
      error.status = 400;
      throw error;
    }
  }

  async generateTests(problem) {
    this.ensureSupported(problem);
    const responses = [];
    let verifiedDraft = [];
    for (let attempt = 0; attempt < 2 && verifiedDraft.length < MIN_TESTS; attempt += 1) {
      const draft = await this.client.completeJson({
        system: 'You are a meticulous senior competitive-programming test designer.',
        user: `Create 12-16 valid, deterministic test inputs for this problem. Cover examples, minimum and maximum boundaries, empty/singleton cases when allowed, duplicates, negative values when allowed, adversarial patterns, and ordinary cases. Do not invent constraints that contradict the statement. Return {"cases":[{"label":"...","category":"normal|edge|boundary|adversarial","args":[...]}]}. Every args array must match the parameter order exactly.\n\nPROBLEM:\n${compactProblem(problem, true)}\n\nThis is generation attempt ${attempt + 1}.`,
        maxTokens: 7000,
      });
      responses.push(draft);
      verifiedDraft = uniqueTests([
        ...verifiedDraft,
        ...await verifyWithReference(problem, normalizeCandidates(draft.data, problem.parameters.length)),
      ]).slice(0, MAX_TESTS);
    }
    if (verifiedDraft.length < MIN_TESTS) {
      throw new Error(`GLM produced only ${verifiedDraft.length} valid cases after local verification. Try again.`);
    }

    const review = await this.client.completeJson({
      system: 'You are the independent verification reviewer for a competitive-programming test suite.',
      user: `Audit the verified test suite below for validity, coverage, redundant inputs, and missed edge cases. Return a revised final suite as {"audit":"...","cases":[{"label":"...","category":"normal|edge|boundary|adversarial","args":[...]}]}. Keep all args compatible with the exact signature. Include 10-16 cases. Do not provide expected outputs; a local oracle calculates them.\n\nPROBLEM:\n${compactProblem(problem, true)}\n\nLOCALLY VERIFIED DRAFT:\n${JSON.stringify(verifiedDraft, null, 2)}`,
      maxTokens: 7000,
    });
    responses.push(review);
    const reviewedCandidates = normalizeCandidates(review.data, problem.parameters.length);
    const reviewed = await verifyWithReference(problem, reviewedCandidates);
    const finalVerified = uniqueTests(reviewed.length >= MIN_TESTS ? reviewed : verifiedDraft).slice(0, MAX_TESTS);
    if (finalVerified.length < MIN_TESTS) throw new Error('The reviewed test suite did not pass local verification.');

    const createdAt = new Date().toISOString();
    const tests = finalVerified.map((test) => ({
      id: randomUUID(),
      ...test,
      verified: true,
      createdAt,
      model: this.client.model,
    }));
    const generation = {
      tests,
      model: this.client.model,
      createdAt,
      audit: String(review.data?.audit || 'GLM review completed.').slice(0, 2000),
      checks: {
        modelPasses: responses.length,
        localReferenceExecutions: 2,
        draftCasesVerified: verifiedDraft.length,
        finalCasesVerified: tests.length,
      },
      usage: sumUsage(responses),
    };
    const state = await this.stateStore.updateProblem(problem.slug, { generatedTests: generation });
    return { ...generation, state };
  }

  async generateSolution(problem) {
    this.ensureSupported(problem);
    const responses = [];
    let stored = this.stateStore.snapshot().problems[problem.slug] || {};
    let generatedTests = stored.generatedTests?.tests || [];
    if (generatedTests.length < MIN_TESTS) {
      const generated = await this.generateTests(problem);
      generatedTests = generated.tests;
      responses.push({ usage: generated.usage });
      stored = generated.state;
    }
    const tests = uniqueTests([...problem.tests, ...generatedTests]).slice(0, 24);
    if (!tests.length) throw new Error('Generate verified test cases before generating a solution.');

    let candidate;
    let verification;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const completion = await this.client.completeJson({
        system: 'You are an expert algorithms engineer. Produce correct, efficient, readable Python 3.',
        user: attempt === 0
          ? `Design an asymptotically optimal Python solution for the problem below. Preserve the exact function name and parameter order. Explain the invariant and why the complexity is optimal under the stated constraints. Return {"code":"...","explanation":"...","timeComplexity":"...","spaceComplexity":"..."}.\n\nPROBLEM:\n${compactProblem(problem, false)}`
          : `Repair the candidate solution using the verified failures below. Preserve the exact solution signature and return the full JSON object with code, explanation, timeComplexity, and spaceComplexity.\n\nPROBLEM:\n${compactProblem(problem, false)}\n\nCANDIDATE:\n${JSON.stringify(candidate)}\n\nFAILURES:\n${JSON.stringify(verification.failures.slice(0, 8), null, 2)}`,
        maxTokens: 8000,
      });
      responses.push(completion);
      candidate = solutionFromPayload(completion.data);
      verification = await verifySolution(problem, candidate.code, tests);
      if (verification.passed) break;
    }
    if (!verification?.passed) {
      throw new Error(`GLM could not produce a solution that passed verification after three attempts. ${verification?.error || ''}`.trim());
    }

    const review = await this.client.completeJson({
      system: 'You are the final independent correctness and optimality reviewer.',
      user: `Review this already test-passing Python solution. Look for untested edge cases, incorrect assumptions, and a better asymptotic approach. Return {"approved":true|false,"issues":["..."],"code":"full reviewed code","explanation":"...","timeComplexity":"...","spaceComplexity":"..."}. If it is already optimal, return it unchanged.\n\nPROBLEM:\n${compactProblem(problem, false)}\n\nCANDIDATE:\n${JSON.stringify(candidate)}\n\nVERIFICATION: passed ${tests.length} locally-oracled cases.`,
      maxTokens: 8000,
    });
    responses.push(review);
    const reviewedCandidate = solutionFromPayload({ ...candidate, ...review.data });
    const reviewedVerification = await verifySolution(problem, reviewedCandidate.code, tests);
    if (reviewedVerification.passed) candidate = reviewedCandidate;

    const createdAt = new Date().toISOString();
    const aiSolution = {
      ...candidate,
      verified: true,
      verifiedCaseCount: tests.length,
      verificationAttempts: responses.length,
      model: this.client.model,
      createdAt,
      reviewerApproved: Boolean(review.data?.approved),
      reviewIssues: Array.isArray(review.data?.issues) ? review.data.issues.map(String).slice(0, 10) : [],
      usage: sumUsage(responses),
    };
    const state = await this.stateStore.updateProblem(problem.slug, { aiSolution });
    return { solution: aiSolution, state };
  }
}
