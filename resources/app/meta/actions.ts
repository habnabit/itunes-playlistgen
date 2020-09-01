import { createAction } from 'typesafe-actions'

import { TrackId } from '../types'

export const dismissError = createAction('playlistgen/meta/dismissError')<{
    index: number
}>()

export const trackArtworkMissing = createAction(
    'playlistgen/meta/trackArtworkMissing',
)<{
    id: TrackId
}>()
