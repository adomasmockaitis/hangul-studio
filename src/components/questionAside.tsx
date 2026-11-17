import { createContext, useContext, type ReactNode } from 'react'

/**
 * Zusatzknopf neben der Hauptaktion einer Frage (z. B. „Überspringen“ / „Ich weiß es nicht“).
 * Der Runner stellt ihn bereit, die Fragekomponenten zeigen ihn links neben „Prüfen“.
 */
export const QuestionAside = createContext<ReactNode>(null)
export const useQuestionAside = () => useContext(QuestionAside)
