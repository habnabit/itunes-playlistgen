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

on all_track_pids(pl)
	tell application "iTunes" to return (the persistent ID of tracks of (the first playlist whose name is pl))
end all_track_pids

on get_track_batch(pln, firstIndex, lastIndex)
	tell application "iTunes"
		set pl to the first playlist whose name is pln
		return (properties of tracks firstIndex through lastIndex of pl)
	end tell
end get_track_batch

on all_tracks(pl)
	tell application "iTunes" to return (properties of tracks of (the first playlist whose name is pl))
end all_tracks

on all_tracks_under_duration(pl, l)
	tell application "iTunes" to ¬
		return (properties of tracks of (the first playlist whose name is pl) whose duration < l)
end all_tracks_under_duration

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
		if ctrl then stop
		set pl to my nested_playlist(plns)
		delete tracks of pl
		repeat with t in tl
			duplicate (the first track whose persistent ID is t) to pl
		end repeat
		if ctrl then play pl
	end tell
end fill_tracks

on get_genius()
	tell application "iTunes"
		set pls to every playlist whose name is "Genius Mixes"
		return the persistent ID of every track of the first item in pls
	end tell
end get_genius

on get_playlists()
	set ret to {}
	tell application "iTunes"
		repeat with pl in (every playlist whose special kind is none)
			if (the tracks of pl exists) and pl's smart is false and pl's genius is false then
				copy {the name of pl, the persistent ID of tracks of pl} to the end of ret
			end if
		end repeat
	end tell
	return ret
end get_playlists
