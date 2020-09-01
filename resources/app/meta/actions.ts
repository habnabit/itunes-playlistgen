import { createAction } from 'typesafe-actions'

export const dismissError = createAction('playlistgen/meta/dismissError')<{
    index: number
}>()
