let voiceCache: SpeechSynthesisVoice | null | undefined

function koreanVoice(): SpeechSynthesisVoice | null {
  if (voiceCache) return voiceCache
  const v = window.speechSynthesis?.getVoices().find((x) => x.lang.toLowerCase().replace('_', '-').startsWith('ko'))
  voiceCache = v ?? null
  return voiceCache
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voiceCache = undefined
  }
}

export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const clean = text.replace(/[[\]]/g, '')
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'ko-KR'
  u.rate = 0.9
  const v = koreanVoice()
  if (v) u.voice = v
  window.speechSynthesis.speak(u)
}
