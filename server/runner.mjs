import { spawn, spawnSync } from 'node:child_process';

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

const PYTHON_STREAM_HARNESS = String.raw`
import contextlib
import io
import json
import sys
import traceback

def normalize(value):
    if isinstance(value, tuple): return [normalize(item) for item in value]
    if isinstance(value, list): return [normalize(item) for item in value]
    if isinstance(value, dict): return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, set): return sorted(normalize(item) for item in value)
    return value

def emit(event):
    sys.__stdout__.write(json.dumps(event, default=str) + '\n')
    sys.__stdout__.flush()

payload = json.loads(sys.stdin.read())
namespace = {}
bootstrap_logs = io.StringIO()
try:
    with contextlib.redirect_stdout(bootstrap_logs):
        exec(compile(payload['code'], '<submission>', 'exec'), namespace)
    solution = namespace.get('solution')
    if not callable(solution): raise NameError("Define a function named 'solution'.")
    all_ok = True
    for index, case in enumerate(payload['cases']):
        emit({'type': 'case-start', 'index': index})
        output_logs = io.StringIO()
        try:
            with contextlib.redirect_stdout(output_logs): value = solution(*case.get('args', []))
            result = {'ok': True, 'value': normalize(value), 'logs': output_logs.getvalue()}
        except Exception:
            result = {'ok': False, 'error': traceback.format_exc(), 'logs': output_logs.getvalue()}
            all_ok = False
        emit({'type': 'case-result', 'index': index, 'result': result})
    emit({'type': 'complete', 'ok': all_ok, 'logs': bootstrap_logs.getvalue()})
except Exception:
    emit({'type': 'complete', 'ok': False, 'error': traceback.format_exc(), 'logs': bootstrap_logs.getvalue()})
`;

const JAVASCRIPT_STREAM_HARNESS = String.raw`
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const originalLog = console.log;
const emit = (event) => originalLog(JSON.stringify(event));
const bootstrapLogs = [];
console.log = (...values) => bootstrapLogs.push(values.map(String).join(' '));
try {
  const solution = new Function(payload.code + "\n; return typeof solution === 'function' ? solution : null;")();
  if (typeof solution !== 'function') throw new Error("Define a function named 'solution'.");
  let allOk = true;
  for (let index = 0; index < payload.cases.length; index += 1) {
    emit({ type: 'case-start', index });
    const logs = [];
    console.log = (...values) => logs.push(values.map(String).join(' '));
    let result;
    try {
      const value = await solution(...(payload.cases[index].args || []));
      result = { ok: true, value: value === undefined ? null : value, logs: logs.join('\n') };
    } catch (error) {
      result = { ok: false, error: error.stack || String(error), logs: logs.join('\n') };
      allOk = false;
    }
    emit({ type: 'case-result', index, result });
  }
  emit({ type: 'complete', ok: allOk, logs: bootstrapLogs.join('\n') });
} catch (error) {
  emit({ type: 'complete', ok: false, error: error.stack || String(error), logs: bootstrapLogs.join('\n') });
}
`;

function execute(command, args, harness, payload, timeout = 60000) {
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

function executeStreaming(command, args, harness, payload, onEvent, { timeout = 60000, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, [...args, harness], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let finalEvent = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => { child.kill(); finish({ ok: false, error: 'Execution cancelled.', results: [] }); };
    const timer = setTimeout(() => {
      child.kill();
      const event = { type: 'complete', ok: false, error: `Execution timed out after ${timeout / 1000} seconds.` };
      onEvent(event);
      finish(event);
    }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'complete') finalEvent = event;
          onEvent(event);
        } catch { stderr += `${line}\n`; }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, error: error.message, results: [] }));
    child.on('close', () => finish(finalEvent || { ok: false, error: stderr || stdout || 'The runner exited without a result.', results: [] }));
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function runCode(editorLanguage, code, cases) {
  if (editorLanguage === 'python') {
    const runtime = detectPythonRuntime();
    if (!runtime.available) return { ok: false, error: runtime.reason, results: [] };
    return execute(runtime.command, [...runtime.prefixArgs, '-I', '-c'], PYTHON_HARNESS, { code, cases });
  }
  if (editorLanguage === 'javascript') return execute(process.execPath, ['--input-type=module', '-e'], JAVASCRIPT_HARNESS, { code, cases });
  return { ok: false, error: 'This language needs external fixtures and is not runnable in the local judge.', results: [] };
}

export async function runCodeStreaming(editorLanguage, code, cases, onEvent, options = {}) {
  if (editorLanguage === 'python') {
    const runtime = detectPythonRuntime();
    if (!runtime.available) return { ok: false, error: runtime.reason, results: [] };
    return executeStreaming(runtime.command, [...runtime.prefixArgs, '-I', '-c'], PYTHON_STREAM_HARNESS, { code, cases }, onEvent, options);
  }
  if (editorLanguage === 'javascript') {
    return executeStreaming(process.execPath, ['--input-type=module', '-e'], JAVASCRIPT_STREAM_HARNESS, { code, cases }, onEvent, options);
  }
  return { ok: false, error: 'This language needs external fixtures and is not runnable in the local judge.', results: [] };
}

let cachedPythonRuntime;
export function detectPythonRuntime() {
  if (cachedPythonRuntime) return cachedPythonRuntime;
  const configured = process.env.CODELAB_PYTHON;
  const candidates = [
    ...(configured ? [{ command: configured, prefixArgs: [] }] : []),
    { command: 'python', prefixArgs: [] },
    { command: 'python3', prefixArgs: [] },
    ...(process.platform === 'win32' ? [{ command: 'py', prefixArgs: ['-3'] }] : []),
  ];
  for (const candidate of candidates) {
    const check = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], { encoding: 'utf8', windowsHide: true });
    if (!check.error && check.status === 0) {
      cachedPythonRuntime = {
        available: true,
        command: candidate.command,
        prefixArgs: candidate.prefixArgs,
        version: (check.stdout || check.stderr || '').trim(),
      };
      return cachedPythonRuntime;
    }
  }
  cachedPythonRuntime = {
    available: false,
    command: null,
    prefixArgs: [],
    version: '',
    reason: 'Python 3 was not found. Install Python or set CODELAB_PYTHON to its executable path.',
  };
  return cachedPythonRuntime;
}

export function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
