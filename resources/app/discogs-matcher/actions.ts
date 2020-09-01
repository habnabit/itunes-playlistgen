import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAction, createAsyncAction } from 'typesafe-actions'

export const fetchUnconfirmedAlbums = createAsyncAction(
    'playlistgen/discogs-matcher/fetchUnconfirmedAlbums/request',
    'playlistgen/discogs-matcher/fetchUnconfirmedAlbums/success',
    'playlistgen/discogs-matcher/fetchUnconfirmedAlbums/failure',
)<
    void,
    {
        json: any
    },
    Error
>()
