 // DEFINE YOUR SONGS HERE
let track_list = [
      {
          name:"headoverheels",
          artist:"kwan li beats",
          path:"https://files.catbox.moe/i75d0t.mp3"
      },
      {
          name:"electric relaxation",
          artist:"a tribe called quest",
          path:"https://files.catbox.moe/cf4iwz.mp3"
      },
      {
          name:"luck of lucien (instrumental)",
          artist:"a tribe called quest",
          path:"https://files.catbox.moe/cera27.mp3"
      },
      {
          name:"maximalist",
          artist:"baths",
          path:"https://files.catbox.moe/nrxmsy.mp3"
      }
  ];
  
// THATS ALL TY :3

let now_playing = document.querySelector(".now-playing");
let track_select = document.querySelector(".track-select");
let playpause_btn = document.querySelector(".playpause-track");
let seek_slider = document.querySelector(".seek_slider");
let curr_time = document.querySelector(".current-time");
let total_duration = document.querySelector(".total-duration");

let track_index = 0;
let isPlaying = false;
let updateTimer;

let curr_track = document.getElementById("music");

function populateDropdown() {
  if (!track_select) return;
  track_select.innerHTML = "";
  track_list.forEach((track, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${track.name} — ${track.artist}`;
    track_select.appendChild(option);
  });
  track_select.value = track_index;
}

function loadTrack(track_index) {
  clearInterval(updateTimer);
  resetValues();

  curr_track.src = track_list[track_index].path;
  curr_track.load();

  if (now_playing) now_playing.textContent = (track_index + 1) + " / " + track_list.length;

  updateTimer = setInterval(seekUpdate, 1000);
  curr_track.addEventListener("ended", nextTrack);

  if (track_select) track_select.value = track_index;
}

function resetValues() {
  curr_time.textContent = "0:00";
  total_duration.textContent = "0:00";
  seek_slider.value = 0;
}

if (track_select) {
  track_select.addEventListener("change", function() {
    track_index = parseInt(this.value);
    loadTrack(track_index);
    playTrack();
  });
}

function playpauseTrack() {
  if (!isPlaying) playTrack();
  else pauseTrack();
}

function playTrack() {
  curr_track.play();
  isPlaying = true;
  playpause_btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
    viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"
    class="lucide lucide-pause-icon"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`;
}

function pauseTrack() {
  curr_track.pause();
  isPlaying = false;
  playpause_btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
    viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"
    class="lucide lucide-play-icon"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003
    3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`;
}

function nextTrack() {
  if (track_index < track_list.length - 1) track_index += 1;
  else track_index = 0;
  loadTrack(track_index);
  playTrack();
}

function prevTrack() {
  if (track_index > 0) track_index -= 1;
  else track_index = track_list.length - 1;
  loadTrack(track_index);
  playTrack();
}

function seekTo() {
  seekto = curr_track.duration * (seek_slider.value / 100);
  curr_track.currentTime = seekto;
}

function seekUpdate() {
  let seekPosition = 0;
  if (!isNaN(curr_track.duration)) {
    seekPosition = curr_track.currentTime * (100 / curr_track.duration);
    seek_slider.value = seekPosition;

    let currentMinutes = Math.floor(curr_track.currentTime / 60);
    let currentSeconds = Math.floor(curr_track.currentTime - currentMinutes * 60);
    let durationMinutes = Math.floor(curr_track.duration / 60);
    let durationSeconds = Math.floor(curr_track.duration - durationMinutes * 60);

    if (currentSeconds < 10) currentSeconds = "0" + currentSeconds;
    if (durationSeconds < 10) durationSeconds = "0" + durationSeconds;

    curr_time.textContent = currentMinutes + ":" + currentSeconds;
    total_duration.textContent = durationMinutes + ":" + durationSeconds;
  }
}

populateDropdown();
loadTrack(track_index);