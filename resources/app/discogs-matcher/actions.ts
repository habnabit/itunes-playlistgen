import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAction, createAsyncAction } from 'typesafe-actions'

import { AlbumId } from '../types'
import { AlbumReselector, DiscogsSelector } from './types'

export const changeUrl = createAction(
    'playlistgen/discogs-matcher/changeControl',
)<{
    id: number
    lens: Lens<DiscogsSelector, AlbumReselector>
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

export const fetchFromDiscogs = createAsyncAction(
    'playlistgen/discogs-matcher/fetchFromDiscogs/request',
    'playlistgen/discogs-matcher/fetchFromDiscogs/success',
    'playlistgen/discogs-matcher/fetchFromDiscogs/failure',
)<
    {
        lens: Lens<DiscogsSelector, AlbumReselector>
    },
    {
        lens: Lens<DiscogsSelector, AlbumReselector>
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
        album: AlbumId
        data: any
    },
    {
        album: AlbumId
        json: any
    },
    Error
>()
