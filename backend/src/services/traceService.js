export async function extractTrace(provider, txHash, parallelIndex) {
  const trace = {
    parallelIndex,
    threadId: `thread-${parallelIndex % 8}`,
    parallelGroup: parallelIndex % 8,
    opcodes: [],
    internalCalls: [],
    opcodeSummary: { opcodeCount: 0 },
    executionMetadata: {}
  };

  try {
    const callTrace = await provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer' }]);
    trace.internalCalls = flattenInternalCalls(callTrace);
    trace.executionMetadata = {
      from: callTrace?.from ?? null,
      to: callTrace?.to ?? null,
      value: callTrace?.value ?? null
    };
  } catch {
    // Keep defaults when call tracing is unavailable.
  }

  try {
    const vmTrace = await provider.send('debug_traceTransaction', [txHash, {}]);
    trace.opcodes = flattenOpcodes(vmTrace);
    trace.opcodeSummary = { opcodeCount: trace.opcodes.length };
  } catch {
    // Keep defaults when opcode tracing is unavailable.
  }

  return trace;
}

function flattenOpcodes(trace) {
  if (!trace?.structLogs) return [];
  return trace.structLogs.map((step) => step.op).filter(Boolean);
}

function flattenInternalCalls(trace) {
  const calls = [];
  if (trace && typeof trace === 'object' && (trace.from || trace.to || trace.type)) {
    calls.push({
      type: trace.type,
      from: trace.from,
      to: trace.to,
      value: trace.value
    });
  }
  walk(trace?.calls || [], calls);
  return calls;
}

function walk(nodes, out) {
  for (const node of nodes) {
    out.push({
      type: node.type,
      from: node.from,
      to: node.to,
      value: node.value
    });
    if (node.calls?.length) walk(node.calls, out);
  }
}
