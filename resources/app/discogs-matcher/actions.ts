import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAction, createAsyncAction } from 'typesafe-actions'

import { AlbumId } from '../types'
import {
    AlbumReselector,
    DiscogsMatchedSelector,
    DiscogsUnconfirmedSelector,
} from './types'

export const changeUrl = createAction('playlistgen/discogs-matcher/changeUrl')<{
    id: number
    lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector>
    value: string
}>()

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

export const fetchMatchedAlbums = createAsyncAction(
    'playlistgen/discogs-matcher/fetchMatchedAlbums/request',
    'playlistgen/discogs-matcher/fetchMatchedAlbums/success',
    'playlistgen/discogs-matcher/fetchMatchedAlbums/failure',
)<
    void,
    {
        json: any
    },
    Error
>()

export const fetchFromDiscogs = createAsyncAction(
    'playlistgen/discogs-matcher/fetchFromDiscogs/request',
    'playlistgen/discogs-matcher/fetchFromDiscogs/success',
    'playlistgen/discogs-matcher/fetchFromDiscogs/failure',
)<
    {
        lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector>
    },
    {
        lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector>
        json: any
    },
    Error
>()

export const confirm = createAsyncAction(
    'playlistgen/discogs-matcher/confirm/request',
    'playlistgen/discogs-matcher/confirm/success',
    'playlistgen/discogs-matcher/confirm/failure',
)<
    {
        data: any
    },
    {
        json: { confirmed: AlbumId }
    },
    Error
>()

export const changeYears = createAction(
    'playlistgen/discogs-matcher/changeYear',
)<{
    years: Set<number>
}>()
