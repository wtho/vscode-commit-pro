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
    return convertCase.toSentenceCase(text)
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
