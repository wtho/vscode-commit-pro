import * as convertCase from 'js-convert-case'

export const caseArray = [
  'lower-case',
  'upper-case',
  'camel-case',
  'kebab-case',
  'pascal-case',
  'sentence-case',
  'snake-case',
  'start-case',
] as const
export type Case = typeof caseArray[number]

export function textToCase(text: string, newCase: Case): string {
  if (newCase === 'camel-case') {
    return convertCase.toCamelCase(text)
  }
  if (newCase === 'kebab-case') {
    return convertCase.toDotCase(text).replace(/\./g, '-').toLocaleLowerCase()
  }
  if (newCase === 'lower-case') {
    return text.toLocaleLowerCase()
  }
  if (newCase === 'pascal-case') {
    return convertCase.toPascalCase(text)
  }
  if (newCase === 'sentence-case') {
    return toSentenceCase(text)
  }
  if (newCase === 'snake-case') {
    return convertCase.toSnakeCase(text)
  }
  if (newCase === 'start-case') {
    return convertCase.toHeaderCase(text)
  }
  if (newCase === 'upper-case') {
    return text.toLocaleUpperCase()
  }
  return text
}

export function toSentenceCase(text: string): string {
  if (!text || typeof text !== 'string') {
    return ''
  }
  const convertSentence = (sentence: string): string => {
    const converted = sentence
      .replace(
        /([a-z])([A-Z])/g,
        (_substring, lower, upper) => `${lower} ${upper.toLowerCase()}`
      )
      // .replace(/[^A-Za-z0-9]+|_+/g, ' ')
      .toLowerCase()
    return `${converted.charAt(0).toUpperCase()}${converted.slice(1)}`
  }

  return text.replace(
    /([^\.;:?! ][^\.;:?!]+)([\.;:?!])/g,
    (_substring, sentence, punctuation) =>
      `${convertSentence(sentence)}${punctuation}`
  )
}
