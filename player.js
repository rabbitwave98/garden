let player;
let currentIndex = 0;

const playlist = [
  { id: "OUfDs5Eh_i0", title: "HeadOverHeels // Tears for Fears x KwanLi" },
  { id: "hflvTmh_9qA", title: "Start A Cult (music box) // Cult of the Lamb x R3 Music Box" },
  { id: "ygkT0qCstmo", title: "Show 'n Tell // Adam Kane" },
  { id: "GM14B2e1cGU", title: "Chill Afternoon Near the Mekong // Jim" }
];


/* === YOUTUBE API === */

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    createPlayer();
    return;
  }

  window.onYouTubeIframeAPIReady = createPlayer;

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(script);
}


/* === CREATE PLAYER === */

function createPlayer() {
  const container = document.getElementById("yt-player");

  if (!container || player) return;

  player = new YT.Player("yt-player", {
    width: "200",
    height: "200",
    videoId: playlist[currentIndex].id,

    playerVars: {
      autoplay: 0,
      controls: 0,
      playsinline: 1
    },

    events: {
      onReady: playerReady,
      onStateChange: handleStateChange,
      onError: handleError
    }
  });
}


/* === PLAYER READY === */

function playerReady() {
  updateTitle();
  updatePlayButton();
}


/* === TITLE === */

function updateTitle() {
  const title = document.getElementById("track-title");

  if (title) {
    title.textContent = playlist[currentIndex].title;
  }
}


/* === PLAY / PAUSE === */

function playPause() {
  if (!player) return;

  const state = player.getPlayerState();

  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}


/* === PLAY BUTTON === */

function updatePlayButton() {
  const button = document.getElementById("play");

  if (!button || !player) return;

  const state = player.getPlayerState();

  button.textContent =
    state === YT.PlayerState.PLAYING ? "⏸" : "▶";
}


/* === NEXT === */

function nextTrack() {
  if (!player) return;

  currentIndex =
    (currentIndex + 1) % playlist.length;

  player.loadVideoById(playlist[currentIndex].id);

  updateTitle();
}


/* === PREVIOUS === */

function prevTrack() {
  if (!player) return;

  currentIndex =
    (currentIndex - 1 + playlist.length) % playlist.length;

  player.loadVideoById(playlist[currentIndex].id);

  updateTitle();
}


/* === STATE CHANGE === */

function handleStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    nextTrack();
  }

  updatePlayButton();
}


/* === ERROR === */

function handleError(event) {
  console.error("YouTube player error:", event.data);
}


/* === BUTTONS === */

function initializeMusicPlayer() {
  const play = document.getElementById("play");
  const next = document.getElementById("next");
  const prev = document.getElementById("prev");

  if (play) {
    play.addEventListener("click", playPause);
  }

  if (next) {
    next.addEventListener("click", nextTrack);
  }

  if (prev) {
    prev.addEventListener("click", prevTrack);
  }

  loadYouTubeAPI();
}


/* === START === */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeMusicPlayer);
} else {
  initializeMusicPlayer();
}