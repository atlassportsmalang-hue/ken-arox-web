const CONFIG = {
  participantSheetId:
    "163cjAL5xD_xk1Rb1SsVrNHE8YH1xv0CdswAJLya8BAE",

  leaderboardSheetId:
    "1ygkNMrD_3KMRJ-eWR8Po-eDCYwIU6Iw-Wzd9WMEdAy4",

  participantGid: "0",
  leaderboardGid: "0"
};

let participants = [];
let leaderboardData = [];

let participantPage = 1;
const participantsPerPage = 10;


/* =========================================================
   GOOGLE SHEET
========================================================= */

function gvizUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&gid=${gid}`;
}


async function loadSheet(id, gid) {

  const response = await fetch(
    gvizUrl(id, gid),
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(
      "Google Sheet tidak dapat diakses"
    );
  }


  const text =
    await response.text();


  const start =
    text.indexOf("{");

  const end =
    text.lastIndexOf("}");


  if (
    start === -1 ||
    end === -1
  ) {

    throw new Error(
      "Format data Google Sheet tidak terbaca"
    );

  }


  const json =
    JSON.parse(
      text.slice(
        start,
        end + 1
      )
    );


  return (
    json.table.rows || []
  ).map(row => {

    return (
      row.c || []
    ).map(cell => {

      if (!cell) {
        return "";
      }

      return (
        cell.f ??
        cell.v ??
        ""
      );

    });

  });
}


/* =========================================================
   PARTICIPANTS — PRIVATE SEARCH ONLY
========================================================= */

async function loadParticipants() {

  const result =
    document.getElementById(
      "participantResult"
    );

  if (!result) {
    return;
  }

  try {

    const rows =
      await loadSheet(
        CONFIG.participantSheetId,
        CONFIG.participantGid
      );

    participants =
      rows
        .map(row => {

          return {

            no:
              row[0] || "",

            team:
              String(
                row[1] || ""
              ).trim(),

            category:
              String(
                row[2] || ""
              )
              .trim()
              .toUpperCase(),

            participant1:
              String(
                row[3] || ""
              ).trim(),

            participant2:
              String(
                row[4] || ""
              ).trim(),

            status:
              String(
                row[9] || ""
              )
              .trim()
              .toUpperCase(),

            estimatedStart:
              String(
                row[10] || ""
              ).trim(),

            racePass:
              String(
                row[11] || ""
              ).trim()

          };

        })
        .filter(item => {

          return (
            item.team &&
            item.team.toUpperCase()
            !==
            "TEAM / ATHLETE NAME"
          );

        });

  }

  catch (error) {

    console.error(
      "Participant Error:",
      error
    );

    result.innerHTML = `
      <div class="participant-search-state error-state">
        <span>DATA UNAVAILABLE</span>
        <strong>Participant lookup belum dapat dimuat.</strong>
        <p>Silakan refresh halaman atau coba kembali beberapa saat lagi.</p>
      </div>
    `;

  }

}


/* =========================================================
   RACE PASS LINK
========================================================= */

function getRacePassDownloadUrl(url) {

  const value = String(url || "").trim();

  if (!value) {
    return "";
  }

  const driveMatch = value.match(
    /(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/
  );

  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }

  return value;
}


function normalizeParticipantSearch(value) {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

}


function escapeHtml(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function searchParticipant() {

  const input =
    document.getElementById(
      "participantSearch"
    );

  const result =
    document.getElementById(
      "participantResult"
    );

  if (!input || !result) {
    return;
  }

  const query =
    normalizeParticipantSearch(
      input.value
    );

  if (!query) {

    result.innerHTML = `
      <div class="participant-search-state">
        <span>PRIVATE LOOKUP</span>
        <strong>Masukkan nama tim atau nama atlet.</strong>
        <p>Daftar peserta tidak ditampilkan untuk menjaga privasi kompetitor.</p>
      </div>
    `;

    return;
  }

  if (query.length < 3) {

    result.innerHTML = `
      <div class="participant-search-state">
        <span>KEEP TYPING</span>
        <strong>Masukkan nama yang lebih lengkap.</strong>
        <p>Gunakan nama tim atau nama atlet sesuai data pendaftaran.</p>
      </div>
    `;

    return;
  }

  /*
    Exact-match only.
    This intentionally prevents broad partial searches from exposing
    competitor names. Search by full team name or full athlete name.
  */
  const matches =
    participants.filter(item => {

      return (
        normalizeParticipantSearch(item.team) === query
        ||
        normalizeParticipantSearch(item.participant1) === query
        ||
        normalizeParticipantSearch(item.participant2) === query
      );

    });

  if (matches.length === 0) {

    result.innerHTML = `
      <div class="participant-search-state not-found-state">
        <span>NOT FOUND</span>
        <strong>Data peserta tidak ditemukan.</strong>
        <p>Pastikan nama tim atau nama atlet ditulis sama seperti saat pendaftaran.</p>
      </div>
    `;

    return;
  }

  const item = matches[0];

  const athletes =
    [
      item.participant1,
      item.participant2
    ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" & ");

  const racePassButton =
    item.racePass
    ?
    `<a
      class="race-pass-btn private-pass-btn"
      href="${escapeHtml(getRacePassDownloadUrl(item.racePass))}"
      target="_blank"
      rel="noopener noreferrer"
    >
      DOWNLOAD RACE PASS
    </a>`
    :
    `<span class="race-pass-empty">RACE PASS NOT READY</span>`;

  result.innerHTML = `
    <article class="participant-private-card">

      <div class="participant-card-topline">
        <span>YOUR RACE INFORMATION</span>
        <span class="status">${escapeHtml(item.status || "REGISTERED")}</span>
      </div>

      <div class="participant-card-main">
        <div>
          <p class="participant-card-label">TEAM / ATHLETE</p>
          <h3>${escapeHtml(item.team)}</h3>
          ${athletes ? `<p class="participant-athletes">${athletes}</p>` : ""}
        </div>

        <div class="participant-private-meta">
          <div>
            <span>CATEGORY</span>
            <strong>${escapeHtml(item.category || "-")}</strong>
          </div>

          <div>
            <span>EST. START</span>
            <strong class="start-time">${escapeHtml(item.estimatedStart || "TBA")}</strong>
          </div>
        </div>
      </div>

      <div class="participant-card-actions">
        ${racePassButton}
      </div>

    </article>
  `;

}


const participantSearch =
  document.getElementById(
    "participantSearch"
  );

const participantSearchBtn =
  document.getElementById(
    "participantSearchBtn"
  );

if (participantSearchBtn) {

  participantSearchBtn.addEventListener(
    "click",
    searchParticipant
  );

}

if (participantSearch) {

  participantSearch.addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        event.preventDefault();
        searchParticipant();
      }

    }
  );

  participantSearch.addEventListener(
    "input",
    event => {

      if (!event.target.value.trim()) {
        searchParticipant();
      }

    }
  );

}


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLeaderboard() {

  const container =
    document.getElementById(
      "leaderboardList"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <div class="data-error">
      Memuat leaderboard...
    </div>

  `;


  try {

    const rows =
      await loadSheet(
        CONFIG.leaderboardSheetId,
        CONFIG.leaderboardGid
      );


    leaderboardData =
      rows
        .map(row => {

          return {

            bib:
              row[0] || "",


            team:
              String(
                row[1] || ""
              ).trim(),


            category:
              String(
                row[2] || ""
              )
              .trim()
              .toUpperCase(),


            time:
              String(
                row[7] || ""
              ).trim(),


            status:
              String(
                row[8] || ""
              )
              .trim()
              .toUpperCase(),


            categoryRank:
              Number(
                row[9]
              ) || 0,


            overallRank:
              Number(
                row[10]
              ) || 0

          };

        })


        .filter(item => {

          return (

            item.team

            &&

            item.team
              .toUpperCase()
            !==
            "TEAM / ATHLETE"

          );

        })


        .filter(item => {

          return (

            !item.status

            ||

            item.status ===
            "FINISHED"

          );

        });


    renderLeaderboard(
      "ALL"
    );

  }

  catch (error) {

    console.error(
      "Leaderboard Error:",
      error
    );


    container.innerHTML = `

      <div class="data-error">

        Leaderboard belum dapat dimuat.

      </div>

    `;

  }

}


/* =========================================================
   RENDER LEADERBOARD
========================================================= */

function renderLeaderboard(
  category = "ALL"
) {

  const container =
    document.getElementById(
      "leaderboardList"
    );


  if (!container) {
    return;
  }


  let data;


  if (
    category === "ALL"
  ) {

    data =
      [...leaderboardData];

  }

  else {

    data =
      leaderboardData.filter(
        item =>
          item.category ===
          category
      );

  }


  data.sort(
    (a, b) => {

      if (
        category !== "ALL"
      ) {

        return (
          (
            a.categoryRank ||
            99999
          )
          -
          (
            b.categoryRank ||
            99999
          )
        );

      }


      return (
        (
          a.overallRank ||
          99999
        )
        -
        (
          b.overallRank ||
          99999
        )
      );

    }
  );


  if (
    data.length === 0
  ) {

    container.innerHTML = `

      <div class="data-error">

        Belum ada hasil pada kategori ini.

      </div>

    `;

    return;

  }


  container.innerHTML =
    data.map(
      (item, index) => {

        let rank;


        if (
          category === "ALL"
        ) {

          rank =
            item.overallRank ||
            index + 1;

        }

        else {

          rank =
            item.categoryRank ||
            index + 1;

        }


        return `

          <div
            class="
              rank-row
              ${
                index < 3
                ?
                "top"
                :
                ""
              }
            "
          >


            <div class="rank-no">

              #${rank}

            </div>


            <div class="rank-team">

              <b>
                ${item.team}
              </b>

              <span>
                KEN AROX 2026
              </span>

            </div>


            <div class="rank-cat">

              ${
                item.category ||
                "-"
              }

            </div>


            <div class="rank-time">

              ${
                item.time ||
                "-"
              }

            </div>


          </div>

        `;

      }
    ).join("");

}


/* =========================================================
   LEADERBOARD FILTER
========================================================= */

document
  .querySelectorAll(
    ".filter"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {


        document
          .querySelectorAll(
            ".filter"
          )
          .forEach(btn => {

            btn.classList.remove(
              "active"
            );

          });


        button.classList.add(
          "active"
        );


        renderLeaderboard(
          button.dataset.category
        );

      }
    );

  });


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

const menuToggle =
  document.getElementById(
    "menuToggle"
  );


const nav =
  document.getElementById(
    "nav"
  );


if (
  menuToggle &&
  nav
) {

  menuToggle.addEventListener(
    "click",
    () => {

      nav.classList.toggle(
        "open"
      );

    }
  );

}


document
  .querySelectorAll(
    "#nav a"
  )
  .forEach(link => {

    link.addEventListener(
      "click",
      () => {

        if (nav) {

          nav.classList.remove(
            "open"
          );

        }

      }
    );

  });


/* =========================================================
   COUNTDOWN
========================================================= */

function updateCountdown() {

  const raceDate =
    new Date(
      "2026-11-28T07:00:00+07:00"
    );


  const now =
    new Date();


  const diff =
    raceDate - now;


  const countdown =
    document.getElementById(
      "countdown"
    );


  if (!countdown) {
    return;
  }


  if (
    diff <= 0
  ) {

    countdown.innerHTML = `

      <strong>
        RACE DAY IS HERE!
      </strong>

    `;

    return;

  }


  const days =
    Math.floor(
      diff /
      86400000
    );


  const hours =
    Math.floor(
      diff /
      3600000 %
      24
    );


  const minutes =
    Math.floor(
      diff /
      60000 %
      60
    );


  const seconds =
    Math.floor(
      diff /
      1000 %
      60
    );


  const d =
    document.getElementById(
      "days"
    );


  const h =
    document.getElementById(
      "hours"
    );


  const m =
    document.getElementById(
      "minutes"
    );


  const s =
    document.getElementById(
      "seconds"
    );


  if (d) {
    d.textContent =
      String(days)
      .padStart(
        2,
        "0"
      );
  }


  if (h) {
    h.textContent =
      String(hours)
      .padStart(
        2,
        "0"
      );
  }


  if (m) {
    m.textContent =
      String(minutes)
      .padStart(
        2,
        "0"
      );
  }


  if (s) {
    s.textContent =
      String(seconds)
      .padStart(
        2,
        "0"
      );
  }

}


/* =========================================================
   START WEBSITE
========================================================= */

updateCountdown();

setInterval(
  updateCountdown,
  1000
);


loadParticipants();

loadLeaderboard();