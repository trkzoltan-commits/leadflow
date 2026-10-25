export function appendVoiceTranscript(currentValue: string, transcript: string, maxLength?: number) {
  const spokenText = transcript.trim();
  if (!spokenText) return currentValue;

  const separator = currentValue && !/\s$/.test(currentValue) ? " " : "";
  const merged = `${currentValue}${separator}${spokenText}`;
  return typeof maxLength === "number" ? merged.slice(0, maxLength) : merged;
}

export function voiceDictationErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "A diktáláshoz engedélyezd a mikrofon használatát a böngészőben.";
  }
  if (error === "audio-capture") {
    return "Nem érhető el használható mikrofon.";
  }
  if (error === "no-speech") {
    return "Nem hallottam beszédet. Próbáld újra közelebb a mikrofonhoz.";
  }
  if (error === "network") {
    return "A beszédfelismerés most nem érhető el. Próbáld újra később.";
  }
  return "A diktálás megszakadt. Próbáld újra.";
}
