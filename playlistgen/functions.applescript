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

on contained_playlists(plns)
	set plp to my nested_playlist(plns)
	set pls to {}
	tell application "iTunes"
		repeat with pl in (every playlist whose special kind is none)
			if pl's parent exists then
				if pl's parent is plp then
					copy {name, persistent ID} of pl to the end of pls
				end if
			end if
		end repeat
	end tell
	return pls
end contained_playlists

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
	end tell
	my append_tracks(plns, tl, true)
end fill_tracks

on append_tracks(plns, tl, dupes)
	tell application "iTunes"
		set pl to my nested_playlist(plns)
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

on remove_tracks(plns, tl)
	tell application "iTunes"
		set pl to my nested_playlist(plns)
		repeat with tid in tl
			delete (every track of pl whose persistent ID is tid)
		end repeat
	end tell
end remove_tracks

on get_playlists()
	set ret to {}
	tell application "iTunes"
		repeat with pl in (every user playlist whose special kind is none and smart is false and genius is false)
			if (the tracks of pl exists) and pl's name does not start with "<" then
				copy {the name of pl, the persistent ID of tracks of pl} to the end of ret
			end if
		end repeat
	end tell
	return ret
end get_playlists

on get_specific_playlists(plnl)
	set ret to {}
	repeat with pln in plnl
		set pl to my nested_playlist(pln)
		tell application "iTunes" to copy {the name of pl, the persistent ID of tracks of pl} to the end of ret
	end repeat
	return ret
end get_specific_playlists
