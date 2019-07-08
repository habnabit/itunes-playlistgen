import { createStandardAction } from 'typesafe-actions'

export const dismissError = createStandardAction('playlistgen/meta/dismissError')<{
    index: number
}>()
