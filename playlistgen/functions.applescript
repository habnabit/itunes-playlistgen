-- -*- coding: mac-roman -*-

on get_playlist(pln, isf, plp)
	tell application "iTunes"
		if isf then
			try
				return the first folder playlist whose name is pln
			on error number -1728
				return make new folder playlist at plp with properties {name:pln}
			end try
		else
			try
				return the first playlist whose name is pln
			on error number -1728
				return make new playlist at plp with properties {name:pln, parent:plp}
			end try
		end if
	end tell
end get_playlist

on nested_playlist(plns)
	tell application "iTunes"
		set prev to null
		repeat with n from 1 to count of plns
			set pln to item n of plns
			set pl to my get_playlist(pln, n < (count of plns), prev)
			set prev to pl
		end repeat
	end tell
end nested_playlist

on delete_playlists(pls)
	tell application "iTunes"
		repeat with pl in pls
			delete (the first playlist whose persistent ID is pl)
		end repeat
	end tell
end delete_playlists

on fill_tracks(plns, tl, ctrl)
	tell application "iTunes"
		set pl to my nested_playlist(plns)
		delete tracks of pl
		my append_tracks(pl's persistent ID, tl, true)
	end tell
end fill_tracks

on append_tracks(pp, tl, dupes)
	tell application "iTunes"
		set pl to the first playlist whose persistent ID is pp
		repeat with tid in tl
			set track_ok to true
			if not dupes then
				set track_ok to (count (every track of pl whose persistent ID is tid)) = 0
			end if
			if track_ok then
				duplicate (the first track whose persistent ID is tid) to the end of pl
			end if
		end repeat
	end tell
end append_tracks

on remove_tracks(pp, tl)
	tell application "iTunes"
		set pl to the first playlist whose persistent ID is pp
		repeat with tid in tl
			delete (every track of pl whose persistent ID is tid)
		end repeat
	end tell
end remove_tracks
