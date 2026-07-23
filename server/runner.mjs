import { spawn } from 'node:child_process';

const PYTHON_HARNESS = String.raw`
import contextlib
import io
import json
import sys
import traceback

def normalize(value):
    if isinstance(value, tuple):
        return [normalize(item) for item in value]
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, set):
        return sorted(normalize(item) for item in value)
    return value

payload = json.loads(sys.stdin.read())
namespace = {}
bootstrap_logs = io.StringIO()
try:
    with contextlib.redirect_stdout(bootstrap_logs):
        exec(compile(payload['code'], '<submission>', 'exec'), namespace)
    solution = namespace.get('solution')
    if not callable(solution):
        raise NameError("Define a function named 'solution'.")
    results = []
    for case in payload['cases']:
        output_logs = io.StringIO()
        try:
            with contextlib.redirect_stdout(output_logs):
                value = solution(*case.get('args', []))
            results.append({'ok': True, 'value': normalize(value), 'logs': output_logs.getvalue()})
        except Exception:
            results.append({'ok': False, 'error': traceback.format_exc(), 'logs': output_logs.getvalue()})
    print(json.dumps({'ok': all(result['ok'] for result in results), 'results': results, 'logs': bootstrap_logs.getvalue()}, default=str))
except Exception:
    print(json.dumps({'ok': False, 'error': traceback.format_exc(), 'results': [], 'logs': bootstrap_logs.getvalue()}))
`;

const JAVASCRIPT_HARNESS = String.raw`
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const bootstrapLogs = [];
const originalLog = console.log;
console.log = (...values) => bootstrapLogs.push(values.map(String).join(' '));
try {
  const solution = new Function(payload.code + "\n; return typeof solution === 'function' ? solution : null;")();
  if (typeof solution !== 'function') throw new Error("Define a function named 'solution'.");
  const results = [];
  for (const testCase of payload.cases) {
    const logs = [];
    console.log = (...values) => logs.push(values.map(String).join(' '));
    try {
      const value = await solution(...(testCase.args || []));
      results.push({ ok: true, value: value === undefined ? null : value, logs: logs.join('\n') });
    } catch (error) {
      results.push({ ok: false, error: error.stack || String(error), logs: logs.join('\n') });
    }
  }
  originalLog(JSON.stringify({ ok: results.every((result) => result.ok), results, logs: bootstrapLogs.join('\n') }));
} catch (error) {
  originalLog(JSON.stringify({ ok: false, error: error.stack || String(error), results: [], logs: bootstrapLogs.join('\n') }));
}
`;

function execute(command, args, harness, payload, timeout = 5000) {
  return new Promise((resolve) => {
    const child = spawn(command, [...args, harness], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: `Execution timed out after ${timeout / 1000} seconds.`, results: [] });
      }
    }, timeout);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: error.message, results: [] });
      }
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ ok: false, error: stderr || stdout || 'The runner exited without a result.', results: [] });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function runCode(editorLanguage, code, cases) {
  if (editorLanguage === 'python') return execute('python', ['-I', '-c'], PYTHON_HARNESS, { code, cases });
  if (editorLanguage === 'javascript') return execute(process.execPath, ['--input-type=module', '-e'], JAVASCRIPT_HARNESS, { code, cases });
  return { ok: false, error: 'This language needs external fixtures and is not runnable in the local judge.', results: [] };
}

export function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
