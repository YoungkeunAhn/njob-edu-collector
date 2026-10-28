// PreToolUse: 토스 검수요청은 bypass 모드에서도 사람 확인을 받는다(외부로 나가고 되돌릴 수 없다).
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'AI 워크플로우 게이트: 토스 검수요청은 확인 후 진행',
  },
}));
