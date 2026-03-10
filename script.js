const firebaseConfig = {
    apiKey: "AIzaSyDEdZ_FfP2I1vv4-qfGYP7YCuXvCORLY2w",
    authDomain: "tracha-xx.firebaseapp.com",
    databaseURL: "https://tracha-xx-default-rtdb.firebaseio.com",
    projectId: "tracha-xx",
    storageBucket: "tracha-xx.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

// GLOBAL SESSION
let currentOfficer = JSON.parse(localStorage.getItem("currentOfficer")) || null;
let activeResultsListener = null;
let returnPage = 'admin'; // Track which page to return to from detailed view

// WIZARD STATE
let allCandidates = [];
const voterPositions = ['Headprefect', 'Assistant Headprefect', 'Chaplain', 'Assistant Chaplain', 'Sports & Health', 'Sanitation', 'Library & ICT Lab'];
let currentVoterStep = 0;
let voterSessionId = null;
let temporarySelections = {}; // Stores { positionName: candidateId }

const PHOTO_MAPPING = {
    "Addo, Yaa Koramah": { url: "assets/Addo, Yaa Koramah.png" },
    "Adu Darko, Samuel": { url: "assets/Adu Darko, Samuel.png" },
    "Agbleke, Elinam": { url: "assets/Agbleke, Elinam.png" },
    "Amponsah-Sam, Johnson Chris": { url: "assets/Amponsah-Sam, Johnson Chris.png" },
    "Asante, Diana": { url: "assets/Asante, Diana.png" },
    "Awumah, Emmanuella Yayra": { url: "assets/Awumah, Emmanuella Yayra.png", zoomOut: true },
    "Boampong, Justina Nyameye Adebi": { url: "assets/Boampong, Justina Nyameye Adebi.png", zoomOut: true },
    "Kpabitey, Cheryl": { url: "assets/Kpabitey, Cheryl.png" },
    "Maaweh, Jayden": { url: "assets/Maaweh, Jayden.png" },
    "Nartey, Shallom": { url: "assets/Nartey, Shallom.png" },
    "Ntiakoh, Efya Aboagyewaa": { url: "assets/Ntiakoh, Efya Aboagyewaa.png" },
    "Odamtten, Christabel": { url: "assets/Odamtten, Christabel.png", zoomOut: true },
    "Shahid, Aqeelatu Sufiyah": { url: "assets/Shahid, Aqeelatu Sufiyah.png" }
};

function getCandidatePhoto(candidate) {
    if (candidate.photoUrl && candidate.photoUrl.startsWith("http")) return candidate.photoUrl;

    const name = candidate.name.trim();
    if (PHOTO_MAPPING[name]) return PHOTO_MAPPING[name].url;

    return candidate.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
}

function getCandidatePhotoStyle(candidate) {
    if (!candidate || !candidate.name) return "";
    const name = candidate.name.trim();
    const mapping = PHOTO_MAPPING[name];
    if (mapping) {
        if (mapping.zoom) {
            return `background-size: ${mapping.zoom}; background-repeat: no-repeat; background-position: center;`;
        }
        if (mapping.zoomOut) {
            return "background-size: contain; background-repeat: no-repeat; background-position: center;";
        }
    }
    return "";
}

function generateVoterId() {
    voterSessionId = Math.floor(10 + Math.random() * 90); // 2-digit ID
    document.getElementById("voterIdBadge").innerText = `ID: ${voterSessionId}`;
    temporarySelections = {};
    currentVoterStep = 0;
    renderVoterStep();
}

function handleRoleSelection() {
    const dropdown = document.getElementById("roleDropdown");
    const selectedRole = dropdown.value;

    if (!selectedRole) return;

    // IF ADMIN, CHECK PASSWORD IMMEDIATELY
    if (selectedRole === 'admin') {
        const pass = prompt("Enter Administrator Portal Password:");
        if (pass !== "Admin@YBS") {
            showToast("Access Denied: Incorrect Password", "fail");
            dropdown.value = "";
            return;
        }
    }

    // Add fade-out animation to welcome card
    const welcomeSection = document.getElementById("welcome");
    welcomeSection.classList.add("fade-out");

    setTimeout(() => {
        welcomeSection.style.display = "none";
        document.getElementById("systemContent").style.display = "block";
        document.getElementById("mainHeader").style.display = "flex";

        // Update Role Badge
        const badge = document.getElementById("roleBadge");
        if (selectedRole === 'admin') badge.innerText = "ADMIN PORTAL";
        else if (selectedRole === 'vetting') badge.innerText = "OFFICER PORTAL";
        else badge.innerText = "VOTING PORTAL";

        if (selectedRole === 'voting') generateVoterId();

        // Show the selected page
        showPage(selectedRole, true);
        updateStats();
        addActivityLog(`Role selected: ${selectedRole}`);
    }, 500);
}

function showPage(id, bypassAuth = false) {
    if (id === 'admin' && !bypassAuth) {
        const pass = prompt("Admin Security: Enter Password:");
        if (pass !== "Admin@YBS") {
            showToast("Access Denied: Incorrect Password", "fail");
            return;
        }
    }

    // Reset Result View when switching pages
    document.getElementById("evaluationResultView").style.display = "none";
    if (activeResultsListener) {
        activeResultsListener();
        activeResultsListener = null;
    }

    document.querySelectorAll(".page").forEach(p => p.style.display = "none");
    const activePage = document.getElementById(id);
    if (activePage) activePage.style.display = "block";

    if (id === 'vetting') updateAuthUI();
    if (id === 'vettingSummary') renderVettingSummary();
}

function backToVetting() {
    document.getElementById("evaluationResultView").style.display = "none";

    if (returnPage === 'admin') {
        showPage('admin', true);
    } else {
        document.getElementById("vettingSection").style.display = "block";
    }

    if (activeResultsListener) {
        activeResultsListener();
        activeResultsListener = null;
    }
}

// LOAD CANDIDATES
db.ref("candidates").on("value", snap => {
    allCandidates = [];
    snap.forEach(data => {
        let d = data.val();
        let id = data.key;
        allCandidates.push({ id, ...d });
    });

    renderVettingStep();
    renderVoterStep();
    renderAdminCandidates();
    updateStats();
});

function renderAdminCandidates() {
    const listDiv = document.getElementById("adminCandidateList");
    if (!listDiv) return;

    if (allCandidates.length === 0) {
        listDiv.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--text-light);">No candidates registered.</td></tr>`;
        return;
    }

    listDiv.innerHTML = allCandidates.map(c => `
        <tr style="border-bottom: 1px solid var(--glass-border);">
            <td style="padding: 12px; display: flex; align-items: center; gap: 10px;">
                <div class="candidate-photo" style="width: 30px; height: 30px; background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                <span style="font-weight: 600;">${c.name}</span>
            </td>
            <td style="padding: 12px; font-size: 0.85rem; color: var(--text-light);">${c.position}</td>
            <td style="padding: 12px; text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
                <button onclick="viewCandidateResults('${c.id}')" 
                    style="background: var(--primary); padding: 5px 12px; font-size: 0.8rem; box-shadow: none;">
                    Scores
                </button>
                <button onclick="deleteCandidate('${c.id}', '${c.name}')" 
                    style="background: #f56565; padding: 5px 12px; font-size: 0.8rem; box-shadow: none;">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function viewCandidateResults(candidateId) {
    const candidate = allCandidates.find(c => c.id === candidateId);
    if (!candidate) return;

    // Track where we are coming from
    const adminPage = document.getElementById("admin");
    returnPage = (adminPage.style.display === "block") ? 'admin' : 'vetting';

    // Switch to vetting page but show detailed results
    // We bypass auth prompt if already in admin, otherwise it's fine
    showPage('vetting', true);
    document.getElementById("vettingSection").style.display = "none";
    document.getElementById("evaluationResultView").style.display = "block";

    // Populate candidate info
    document.getElementById("resName").innerText = candidate.name;
    document.getElementById("resPosition").innerText = candidate.position;
    const resPhoto = document.getElementById("resPhoto");
    resPhoto.style.backgroundImage = `url('${getCandidatePhoto(candidate)}')`;
    resPhoto.style.cssText += getCandidatePhotoStyle(candidate);

    // Fetch and display scores
    const officerScoresDiv = document.getElementById("officerScores");
    const grandTotalEl = document.getElementById("grandTotal");
    const resStatusEl = document.getElementById("resStatus");

    officerScoresDiv.innerHTML = "Loading scores...";
    grandTotalEl.innerText = "0";

    if (activeResultsListener) activeResultsListener();

    activeResultsListener = db.ref(`scores/${candidateId}`).on("value", snap => {
        officerScoresDiv.innerHTML = "";
        let grandTotal = 0;
        let count = 0;

        snap.forEach(child => {
            const data = child.val();
            grandTotal += data.total || 0;
            count++;

            officerScoresDiv.innerHTML += `
                <div style="background: #fff; padding: 15px; border-radius: 12px; margin-bottom: 10px; border-left: 5px solid var(--primary); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div>
                        <div style="font-weight: 700; color: var(--accent);">${data.officer || 'Unknown Officer'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light);">
                            Acad: ${data.academic} | App: ${data.appearance} | Disc: ${data.discipline} | Comm: ${data.communication} | Part: ${data.participation}
                        </div>
                    </div>
                    <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary-dark);">${data.total}</div>
                </div>
            `;
        });

        if (count === 0) {
            officerScoresDiv.innerHTML = `<p style="text-align: center; color: var(--text-light);">No evaluations yet.</p>`;
            resStatusEl.innerText = "Awaiting Evaluation";
            resStatusEl.className = "status-badge";
        } else {
            grandTotalEl.innerText = grandTotal;
            resStatusEl.innerText = "Vetted";
            resStatusEl.className = "status-badge status-qualified";
        }
    });
}

function renderVettingSummary() {
    const listDiv = document.getElementById("vettingSummaryList");
    const statsDiv = document.getElementById("summaryStats");
    if (!listDiv) return;

    listDiv.innerHTML = "<tr><td colspan='6' style='text-align: center; padding: 2rem;'>Loading summary data...</td></tr>";

    db.ref("scores").once("value", snap => {
        const scoresData = snap.val() || {};
        listDiv.innerHTML = "";
        let qualifiedCount = 0;
        let totalCount = 0;

        // Group candidates by position
        const groupedCandidates = {};
        voterPositions.forEach(pos => {
            groupedCandidates[pos] = allCandidates.filter(c => c.position === pos);
        });

        voterPositions.forEach(pos => {
            let candidates = groupedCandidates[pos];
            if (candidates.length === 0) return;

            // Pre-calculate scores and sort descending
            candidates = candidates.map(c => {
                const candidateScores = scoresData[c.id] || {};
                const officers = Object.keys(candidateScores);
                const numOfficers = officers.length;
                let grandTotal = 0;
                officers.forEach(offId => grandTotal += candidateScores[offId].total || 0);
                const maxPossible = numOfficers * 20;
                const percentage = maxPossible > 0 ? (grandTotal / maxPossible) * 100 : 0;

                const isHeadPrefect = c.position && c.position.toLowerCase().includes("headprefect");
                const threshold = isHeadPrefect ? 70 : 50;
                const isQualified = percentage >= threshold && numOfficers > 0;

                return { ...c, grandTotal, numOfficers, percentage, maxPossible, isQualified, threshold };
            }).sort((a, b) => b.percentage - a.percentage);

            // Add Position Header Row
            listDiv.innerHTML += `
                <tr style="background: rgba(43, 108, 176, 0.05); border-left: 5px solid var(--primary);">
                    <td colspan="6" style="padding: 15px; font-weight: 800; color: var(--primary-dark); text-transform: uppercase; letter-spacing: 1px;">
                        ${pos}
                    </td>
                </tr>
            `;

            candidates.forEach(candidate => {
                let disqualificationReason = "";
                if (!candidate.isQualified) {
                    if (candidate.numOfficers === 0) {
                        disqualificationReason = "Candidate has not been evaluated by any vetting officers yet.";
                    } else if (candidate.percentage < candidate.threshold) {
                        const diff = (candidate.threshold - candidate.percentage).toFixed(1);
                        disqualificationReason = `Scored ${candidate.percentage.toFixed(1)}%. Requires ${candidate.threshold}% to qualify (Short by ${diff}%).`;
                    }
                }

                if (candidate.isQualified) qualifiedCount++;
                totalCount++;

                const statusClass = candidate.isQualified ? "status-qualified" : "status-disqualified";
                const statusText = candidate.isQualified ? "Qualified" : "Disqualified";

                listDiv.innerHTML += `
                    <tr>
                        <td style="padding-left: 25px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 35px; height: 35px; border-radius: 50%; background-size: cover; background-position: center; background-image: url('${getCandidatePhoto(candidate)}'); ${getCandidatePhotoStyle(candidate)}"></div>
                                <span style="font-weight: 700;">${candidate.name}</span>
                            </div>
                        </td>
                        <td style="color: var(--text-light); font-size: 0.8rem;">${candidate.position}</td>
                        <td class="hide-on-print" style="text-align: center;">${candidate.numOfficers}</td>
                        <td style="text-align: center; font-weight: 700;">${candidate.grandTotal} <span style="font-size: 0.7rem; color: var(--text-light); font-weight: 400;">/ ${candidate.maxPossible}</span></td>
                        <td style="text-align: center;">
                            <span class="percentage-badge" style="background: ${candidate.isQualified ? 'rgba(72, 187, 120, 0.1)' : 'rgba(245, 101, 101, 0.1)'}; color: ${candidate.isQualified ? '#2f855a' : '#c53030'};">
                                ${candidate.percentage.toFixed(1)}%
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${statusClass}" style="margin: 0; width: 100%; text-align: center;">${statusText}</span>
                            ${!candidate.isQualified ? `<div style="font-size: 0.7rem; color: #c53030; text-align: center; margin-top: 4px; font-weight: 600;">${disqualificationReason}</div>` : ""}
                        </td>
                    </tr>
                `;
            });
        });


        if (totalCount === 0) {
            listDiv.innerHTML = "<tr><td colspan='6' style='text-align: center; padding: 2rem; color: var(--text-light);'>No candidates registered yet.</td></tr>";
            statsDiv.innerText = "No data available";
        } else {
            statsDiv.innerText = `${qualifiedCount} of ${totalCount} Candidates Qualified`;
        }
    });
}



function deleteCandidate(id, name) {
    if (!confirm(`Are you sure you want to delete candidate "${name}"? This will also remove any votes they have received.`)) return;

    // Delete candidate
    db.ref("candidates/" + id).remove().then(() => {
        // Also delete their votes and scores
        db.ref("votes/" + id).remove();
        db.ref("votes/" + id + "_no").remove();
        db.ref("scores/" + id).remove();

        showToast("Candidate Deleted Successfully", "success");
        addActivityLog(`Candidate Deleted: ${name}`);
        updateStats();
    }).catch(err => {
        showToast("Error deleting candidate", "fail");
    });
}

let currentVettingPos = null;
let currentVettingCandidateIndex = 0;

function renderVettingStep() {
    const candidatesDiv = document.getElementById("candidates");
    if (!candidatesDiv) return;

    if (!currentVettingPos) {
        // LEVEL 1: POSITION SELECTION
        candidatesDiv.innerHTML = `
            <div class="card" style="border-top: 8px solid var(--primary); border-radius: 20px;">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <h2 style="color: var(--primary-dark); margin: 0; text-transform: uppercase; letter-spacing: 2px;">Vetting Selection</h2>
                    <p style="color: var(--text-light); font-size: 0.9rem;">Choose a position to begin evaluation</p>
                </div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                    ${voterPositions.map(pos => {
            const count = allCandidates.filter(c => c.position === pos).length;
            return `
                            <button onclick="selectVettingPos('${pos}')" style="display: flex; justify-content: space-between; align-items: center; background: #fff; color: var(--primary-dark); border: 1px solid var(--glass-border); text-align: left; padding: 20px; border-radius: 12px;">
                                <span style="font-weight: 700;">${pos}</span>
                                <span style="font-size: 0.75rem; background: var(--primary); color: white; padding: 2px 8px; border-radius: 10px;">${count} Candidates</span>
                            </button>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } else {
        // LEVEL 2: INDIVIDUAL CANDIDATE CARDS
        const filtered = allCandidates.filter(c => c.position === currentVettingPos);

        if (filtered.length === 0) {
            candidatesDiv.innerHTML = `
                <div class="card" style="text-align: center; padding: 3rem;">
                    <h3>No candidates for ${currentVettingPos}</h3>
                    <button onclick="currentVettingPos = null; renderVettingStep();" style="margin-top: 1rem;">Back to Positions</button>
                </div>
            `;
            return;
        }

        const candidate = filtered[currentVettingCandidateIndex];
        const isLastCandidate = currentVettingCandidateIndex === filtered.length - 1;

        // FETCH EXISTING SCORES FOR THIS OFFICER
        db.ref(`scores/${candidate.id}/${currentOfficer.id}`).once("value", snap => {
            const data = snap.val() || {};

            candidatesDiv.innerHTML = `
                <div class="candidate-vetting-card">
                    <div class="card" style="border-left: 8px solid var(--primary); border-radius: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                            <button onclick="currentVettingPos = null; renderVettingStep();" style="background: none; color: var(--text-light); box-shadow: none; padding: 0;">← Back to Positions</button>
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary-dark);">${currentVettingPos}</span>
                        </div>

                        <div style="text-align: center; margin-bottom: 2rem;">
                            <div class="candidate-photo-large" style="margin-bottom: 1rem; background-image: url('${getCandidatePhoto(candidate)}'); ${getCandidatePhotoStyle(candidate)}"></div>
                            <h2 style="color: var(--primary-dark); margin: 0;">${candidate.name}</h2>
                            <p style="font-size: 0.8rem; margin-top: 10px; color: var(--text-light);">Candidate ${currentVettingCandidateIndex + 1} of ${filtered.length}</p>
                            ${data.total ? `<div style="margin-top: 5px; font-weight: 700; color: var(--primary); font-size: 0.9rem;">Evaluation Status: Submitted (${data.total} pts)</div>` : ''}
                        </div>

                        <div class="score-inputs">
                            <div class="score-field"><label>Academic</label><input type="number" max="4" min="0" id="a${candidate.id}" value="${data.academic || 0}" placeholder="0-4"></div>
                            <div class="score-field"><label>Appearance</label><input type="number" max="4" min="0" id="b${candidate.id}" value="${data.appearance || 0}" placeholder="0-4"></div>
                            <div class="score-field"><label>Discipline</label><input type="number" max="4" min="0" id="c${candidate.id}" value="${data.discipline || 0}" placeholder="0-4"></div>
                            <div class="score-field"><label>Communication</label><input type="number" max="4" min="0" id="d${candidate.id}" value="${data.communication || 0}" placeholder="0-4"></div>
                            <div class="score-field"><label>Participation</label><input type="number" max="4" min="0" id="e${candidate.id}" value="${data.participation || 0}" placeholder="0-4"></div>
                        </div>

                        <div class="navigation-controls">
                            <button onclick="changeVettingIndex(-1)" style="background: var(--accent); flex: 1;" ${currentVettingCandidateIndex === 0 ? 'disabled' : ''}>← Previous</button>
                            <button onclick="submitScore('${candidate.id}','${candidate.position}', '${candidate.name}')" style="flex: 2;">${data.total ? 'Update Evaluation' : 'Submit Evaluation'}</button>
                            
                            ${isLastCandidate ?
                    `<button onclick="currentVettingPos = null; renderVettingStep();" style="background: #27ae60; flex: 1;">Done ✓</button>` :
                    `<button onclick="changeVettingIndex(1)" style="background: var(--accent); flex: 1;">Next →</button>`
                }
                        </div>
                    </div>
                </div>
            `;
        });
    }
}

function selectVettingPos(pos) {
    currentVettingPos = pos;
    currentVettingCandidateIndex = 0;
    renderVettingStep();
}

function changeVettingIndex(dir) {
    currentVettingCandidateIndex += dir;
    renderVettingStep();
}

function submitScore(candidateId, position, candidateName) {
    if (!currentOfficer) {
        showToast("Session expired. Please login again.", "fail");
        logoutOfficer();
        return;
    }

    const a = parseInt(document.getElementById(`a${candidateId}`).value) || 0;
    const b = parseInt(document.getElementById(`b${candidateId}`).value) || 0;
    const c = parseInt(document.getElementById(`c${candidateId}`).value) || 0;
    const d = parseInt(document.getElementById(`d${candidateId}`).value) || 0;
    const e = parseInt(document.getElementById(`e${candidateId}`).value) || 0;

    const total = a + b + c + d + e;

    db.ref(`scores/${candidateId}/${currentOfficer.id}`).set({
        officer: currentOfficer.name,
        academic: a,
        appearance: b,
        discipline: c,
        communication: d,
        participation: e,
        total: total,
        timestamp: Date.now()
    }).then(() => {
        showToast(`Evaluation for ${candidateName} submitted!`, "success");
        addActivityLog(`Vetting submitted for ${candidateName} by ${currentOfficer.name}`);
        updateStats();

        // Trigger the score summary popup
        const candidate = allCandidates.find(c => c.id === candidateId);
        showTotalScore(candidateId, candidateName, position, candidate.photoUrl);

    }).catch(err => {
        console.error("Submission error:", err);
        showToast("Error submitting evaluation.", "fail");
    });
}

function showTotalScore(candidateId, candidateName, position, photoUrl) {
    db.ref(`scores/${candidateId}`).once("value", snap => {
        let totalSum = 0;
        snap.forEach(child => {
            totalSum += child.val().total || 0;
        });

        document.getElementById("scoreResName").innerText = candidateName;
        document.getElementById("scoreResPosition").innerText = position;
        document.getElementById("scoreResTotal").innerText = totalSum;
        const scorePhoto = document.getElementById("scoreResPhoto");
        scorePhoto.style.backgroundImage = `url('${getCandidatePhoto({ name: candidateName, photoUrl: photoUrl })}')`;
        scorePhoto.style.cssText += getCandidatePhotoStyle({ name: candidateName });

        toggleModal('scoreSummaryModal', true);
    });
}

function closeScoreSummary() {
    toggleModal('scoreSummaryModal', false);

    // After closing summary, move to next candidate or positions
    const filtered = allCandidates.filter(c => c.position === currentVettingPos);
    if (currentVettingCandidateIndex < filtered.length - 1) {
        changeVettingIndex(1);
    } else {
        currentVettingPos = null;
        renderVettingStep();
    }
}

function renderVoterStep() {
    const voteListDiv = document.getElementById("voteList");
    const stepIndicator = document.getElementById("voterStepIndicator");
    const positionTitle = document.getElementById("currentPositionTitle");
    const btnNext = document.getElementById("btnNextPosition");
    const finishView = document.getElementById("finishVoting");
    const wizardHeader = document.querySelector(".wizard-header");
    const wizardNav = document.querySelector(".wizard-nav");

    if (!voteListDiv) return;

    const pos = voterPositions[currentVoterStep];
    const selectedId = temporarySelections[pos];

    // Reset view
    voteListDiv.innerHTML = "<div style='text-align: center; padding: 2rem;'>Checking qualified candidates...</div>";
    voteListDiv.style.display = "block";
    finishView.style.display = "none";
    if (wizardHeader) wizardHeader.style.display = "block";

    if (positionTitle) positionTitle.innerText = pos;
    if (stepIndicator) stepIndicator.innerText = `Step ${currentVoterStep + 1} of ${voterPositions.length}`;

    // Fetch scores to check qualification
    db.ref("scores").once("value", snap => {
        const scoresData = snap.val() || {};
        voteListDiv.innerHTML = "";

        // Filter qualified candidates for this position
        const filtered = allCandidates.filter(c => {
            if (c.position !== pos) return false;

            const candidateScores = scoresData[c.id] || {};
            const officers = Object.keys(candidateScores);
            const numOfficers = officers.length;

            let grandTotal = 0;
            officers.forEach(offId => {
                grandTotal += candidateScores[offId].total || 0;
            });

            const maxPossible = numOfficers * 20;
            const percentage = maxPossible > 0 ? (grandTotal / maxPossible) * 100 : 0;

            const isHeadPrefect = c.position && c.position.toLowerCase().includes("headprefect");
            const threshold = isHeadPrefect ? 70 : 50;

            return percentage >= threshold;
        });

        if (filtered.length === 0) {
            voteListDiv.innerHTML = `<div class="card" style="text-align: center; color: var(--text-light); padding: 3rem;">No qualified candidates for ${pos}.</div>`;
            if (btnNext) {
                btnNext.disabled = false;
                btnNext.innerText = "Skip Position →";
            }
        } else {
            if (filtered.length === 1) {
                const c = filtered[0];
                const selection = temporarySelections[pos]; // This could be candidateId or candidateId + "_no"
                const isYes = selection === c.id;
                const isNo = selection === c.id + "_no";

                voteListDiv.innerHTML = `
                    <div class="card candidate-card-square ${isYes || isNo ? 'selected-candidate' : ''}" style="cursor: default;">
                        <div class="candidate-photo-square" style="background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                        <div style="width: 100%;">
                            <div style="font-weight: 700; color: var(--primary-dark); font-size: 1.1rem; margin-bottom: 5px;">${c.name}</div>
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 15px;">Single Candidate Position</div>
                            
                            <div class="btn-vote-container">
                                <button class="btn-vote btn-yes" style="flex: 1; border-radius: 12px; ${isYes ? 'border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.2);' : 'opacity: 0.7;'}" 
                                    onclick="selectCandidate('${c.id}', '${pos}', 'yes')">
                                    ${isYes ? 'Selected YES' : 'YES'}
                                </button>
                                <button class="btn-vote btn-no" style="flex: 1; border-radius: 12px; ${isNo ? 'border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.2);' : 'opacity: 0.7;'}" 
                                    onclick="selectCandidate('${c.id}', '${pos}', 'no')">
                                    ${isNo ? 'Selected NO' : 'NO'}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                voteListDiv.className = "candidate-grid";
                filtered.forEach(c => {
                    const isSelected = selectedId === c.id;
                    voteListDiv.innerHTML += `
                        <div class="card candidate-card-square ${isSelected ? 'selected-candidate' : ''}" onclick="selectCandidate('${c.id}', '${pos}')">
                            <div class="candidate-photo-square" style="background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                            <div style="width: 100%;">
                                <div style="font-weight: 700; color: var(--primary-dark); font-size: 1.1rem; margin-bottom: 10px;">${c.name}</div>
                                <button class="btn-vote" style="width: 100%; border-radius: 12px;">${isSelected ? 'Selected' : 'Vote'}</button>
                            </div>
                        </div>
                    `;
                });
            }

            if (btnNext) {
                const hasSelection = temporarySelections[pos];
                btnNext.disabled = !hasSelection;
                btnNext.innerText = hasSelection ?
                    (currentVoterStep === voterPositions.length - 1 ? "Finish Voting ✓" : "Confirm & Next →") :
                    "Select an option";
            }
        }
    });
}


function selectCandidate(candidateId, position, voteType = 'standard') {
    if (voteType === 'no') {
        temporarySelections[position] = candidateId + "_no";
    } else {
        temporarySelections[position] = candidateId;
    }
    renderVoterStep();
    const name = allCandidates.find(c => c.id === candidateId).name;
    const msg = voteType === 'standard' ? name : `${name} (${voteType.toUpperCase()})`;
    showToast("Selected: " + msg, "success");
}

function changeVoterStep(dir) {
    const pos = voterPositions[currentVoterStep];
    if (!temporarySelections[pos] && allCandidates.filter(c => c.position === pos).length > 0) {
        showToast("Please make a selection first", "fail");
        return;
    }

    if (dir === 1 && currentVoterStep === voterPositions.length - 1) {
        submitAllVotes();
        return;
    }

    currentVoterStep += dir;
    renderVoterStep();
}

function addActivityLog(msg) {
    const logDiv = document.getElementById("activityLog");
    const entry = document.createElement("div");
    entry.className = "log-entry";
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span>${msg}</span><span class="timestamp">${time}</span>`;
    logDiv.prepend(entry);

    // Keep only last 20 logs
    if (logDiv.children.length > 20) logDiv.lastChild.remove();
}

function updateStats() {
    // Admin Stats (Candidates & Vetting)
    db.ref("candidates").once("value", snap => {
        const count = snap.numChildren();
        if (document.getElementById("statCandidates")) {
            document.getElementById("statCandidates").innerText = count;
        }

        db.ref("scores").once("value", scoreSnap => {
            const vettedCount = scoreSnap.numChildren();
            const progress = count > 0 ? Math.round((vettedCount / count) * 100) : 0;
            if (document.getElementById("statVetting")) {
                document.getElementById("statVetting").innerText = progress + "%";
            }

            // Vetting Page Stats
            if (document.getElementById("statVettedCount")) {
                document.getElementById("statVettedCount").innerText = vettedCount;
            }
        });
    });

    // Real-time Vote Stats
    db.ref("votes").once("value", snap => {
        let totalVotes = 0;
        snap.forEach(d => totalVotes += d.numChildren());
        if (document.getElementById("statVotes")) {
            document.getElementById("statVotes").innerText = totalVotes;
        }
    });
}

// SETUP PERIODIC REFRESH (Every 3 Seconds)
setInterval(() => {
    // Only refresh if Admin portal is visible
    const adminPage = document.getElementById("admin");
    if (adminPage && adminPage.style.display !== "none") {
        updateStats();
        renderAdminCandidates();
        // Live Results listener is already real-time (db.ref("votes").on("value", ...))
    }
}, 3000);

function updateAuthUI() {
    const statusDiv = document.getElementById("authStatus");
    const authSection = document.getElementById("authSection");
    const vettingSection = document.getElementById("vettingSection");
    const evaluationResultView = document.getElementById("evaluationResultView");

    if (currentOfficer) {
        statusDiv.innerText = `Officer: ${currentOfficer.name}`;
        authSection.style.display = "none";

        // Only show vetting if not in result view
        if (evaluationResultView.style.display !== "block") {
            vettingSection.style.display = "block";
        }
    } else {
        statusDiv.innerText = "Not logged in";
        authSection.style.display = "block";
        vettingSection.style.display = "none";
        evaluationResultView.style.display = "none";
    }
}

function logoutOfficer() {
    currentOfficer = null;
    localStorage.removeItem("currentOfficer");
    updateAuthUI();
    showToast("Logged out successfully", "success");
}

function handleGlobalLogout() {
    logoutOfficer();
    setTimeout(() => {
        location.reload();
    }, 500);
}

function addCandidate() {
    const nameInput = document.getElementById("name");
    const photoUrlInput = document.getElementById("photoUrl");
    const posInput = document.getElementById("position");

    if (!nameInput.value || !posInput.value) {
        showToast("Please fill all fields", "fail");
        return;
    }

    let id = Date.now();
    db.ref("candidates/" + id).set({
        name: nameInput.value,
        photoUrl: photoUrlInput.value || "",
        position: posInput.value
    }).then(() => {
        showToast("Candidate Saved Successfully", "success");
        addActivityLog(`Candidate Added: ${nameInput.value}`);
        nameInput.value = "";
        photoUrlInput.value = "";
        updateStats();
    }).catch(err => {
        showToast("Error saving candidate", "fail");
    });
}

function registerOfficer() {
    const name = document.getElementById("offName").value.trim();
    const password = document.getElementById("offPassword").value.trim();

    if (!name || !password) {
        showToast("Fill Name and Password", "fail");
        return;
    }

    const officerId = btoa(name + password).replace(/=/g, "");

    db.ref("officers/" + officerId).get().then(snap => {
        if (snap.exists()) {
            showToast("Officer already registered. Please login.", "fail");
        } else {
            db.ref("officers/" + officerId).set({ name, password })
                .then(() => {
                    showToast("Officer Registered!", "success");
                    addActivityLog(`New Officer Registered: ${name}`);
                });
        }
    });
}

function loginOfficer() {
    const name = document.getElementById("offName").value.trim();
    const password = document.getElementById("offPassword").value.trim();

    if (!name || !password) {
        showToast("Fill Name and Password", "fail");
        return;
    }

    const officerId = btoa(name + password).replace(/=/g, "");

    db.ref("officers/" + officerId).get().then(snap => {
        if (snap.exists()) {
            const officerData = snap.val();
            if (officerData.password !== password) {
                showToast("Incorrect password.", "fail");
                return;
            }
            currentOfficer = { id: officerId, ...officerData };
            localStorage.setItem("currentOfficer", JSON.stringify(currentOfficer));
            updateAuthUI();
            showToast("Login Successful", "success");
            addActivityLog(`Officer Login: ${name}`);
        } else {
            showToast("Officer not found. Please register.", "fail");
        }
    });
}

function submitAllVotes() {
    const updates = {};
    Object.values(temporarySelections).forEach(candidateId => {
        const voteId = db.ref().child('votes').child(candidateId).push().key;
        updates[`/votes/${candidateId}/${voteId}`] = {
            voterId: voterSessionId,
            timestamp: Date.now()
        };
    });

    db.ref().update(updates).then(() => {
        document.getElementById("voteList").style.display = "none";
        document.getElementById("finishVoting").style.display = "block";
        const wizardHeader = document.querySelector(".wizard-header");
        if (wizardHeader) wizardHeader.style.display = "none";
        addActivityLog(`Voter ${voterSessionId} successfully cast votes.`);
    }).catch(err => {
        showToast("Error submitting votes", "fail");
    });
}

// MODAL CONTROL
function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = show ? 'flex' : 'none';
}

// TOAST
function showToast(msg, type) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.className = "toast " + type;
    toast.style.display = "block";
    setTimeout(() => toast.style.display = "none", 4000);
}

// LIVE RESULTS (Final Results in Admin)
db.ref("votes").on("value", snap => {
    const resultsDiv = document.getElementById("groupedResults");
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "";

    let votesByCandidate = {};
    snap.forEach(d => {
        votesByCandidate[d.key] = d.numChildren();
    });

    // Group allCandidates by position
    let groups = {};
    voterPositions.forEach(pos => {
        groups[pos] = allCandidates.filter(c => c.position === pos);
    });

    Object.keys(groups).forEach(pos => {
        const candidatesInPos = groups[pos];
        if (candidatesInPos.length === 0) return;

        let totalPosVotes = 0;
        candidatesInPos.forEach(c => {
            totalPosVotes += (votesByCandidate[c.id] || 0);
            if (candidatesInPos.length === 1) {
                totalPosVotes += (votesByCandidate[c.id + "_no"] || 0);
            }
        });

        let groupHtml = `
            <div class="position-group-card card">
                <div class="position-header">
                    <span>${pos}</span>
                    <span style="color: var(--text-light); font-size: 0.75rem;">Total: ${totalPosVotes} votes</span>
                </div>
        `;

        if (candidatesInPos.length === 1) {
            const c = candidatesInPos[0];
            const yesVotes = votesByCandidate[c.id] || 0;
            const noVotes = votesByCandidate[c.id + "_no"] || 0;
            const total = yesVotes + noVotes;
            const yesPercent = total > 0 ? Math.round((yesVotes / total) * 100) : 0;
            const noPercent = total > 0 ? Math.round((noVotes / total) * 100) : 0;

            groupHtml += `
                <div class="candidate-result-item" style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="candidate-photo" style="width: 50px; height: 50px; border-radius: 12px; background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                        <div style="flex: 1;">
                            <div style="font-weight: 700; color: var(--primary-dark); font-size: 1.1rem; margin-bottom: 10px;">${c.name} <small style="font-weight: 400; color: var(--text-light);">(Single Candidate)</small></div>
                            
                            <!-- YES RESULTS -->
                            <div style="margin-bottom: 10px;">
                                <div class="vote-info">
                                    <span style="color: #2f855a;">YES Votes</span>
                                    <span style="color: #2f855a;">${yesVotes} <small>(${yesPercent}%)</small></span>
                                </div>
                                <div class="vote-bar-container" style="background: rgba(72, 187, 120, 0.1);">
                                    <div class="vote-bar-fill" style="width: ${yesPercent}%; background: #48bb78;"></div>
                                </div>
                            </div>

                            <!-- NO RESULTS -->
                            <div>
                                <div class="vote-info">
                                    <span style="color: #c53030;">NO Votes</span>
                                    <span style="color: #c53030;">${noVotes} <small>(${noPercent}%)</small></span>
                                </div>
                                <div class="vote-bar-container" style="background: rgba(245, 101, 101, 0.1);">
                                    <div class="vote-bar-fill" style="width: ${noPercent}%; background: #f56565;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            candidatesInPos.sort((a, b) => (votesByCandidate[b.id] || 0) - (votesByCandidate[a.id] || 0));

            candidatesInPos.forEach(c => {
                const votes = votesByCandidate[c.id] || 0;
                const percent = totalPosVotes > 0 ? Math.round((votes / totalPosVotes) * 100) : 0;

                groupHtml += `
                    <div class="candidate-result-item" style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="candidate-photo" style="width: 40px; height: 40px; border-radius: 8px; background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                            <div style="flex: 1;">
                                <div class="vote-info">
                                    <span>${c.name}</span>
                                    <span>${votes} <small>(${percent}%)</small></span>
                                </div>
                                <div class="vote-bar-container">
                                    <div class="vote-bar-fill" style="width: ${percent}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        groupHtml += `</div>`;
        resultsDiv.innerHTML += groupHtml;
    });

    if (allCandidates.length === 0) {
        resultsDiv.innerHTML = `<div style="text-align: center; color: var(--text-light); padding: 3rem; grid-column: 1/-1;">Waiting for candidate registration...</div>`;
    }
});

function generateWinnerIDCards() {
    db.ref("votes").once("value", snap => {
        const votesByCandidate = {};
        snap.forEach(d => {
            votesByCandidate[d.key] = d.numChildren();
        });

        const winners = [];

        voterPositions.forEach(pos => {
            const candidatesInPos = allCandidates.filter(c => c.position === pos);
            if (candidatesInPos.length === 0) return;

            if (candidatesInPos.length === 1) {
                // Single Candidate (Yes/No)
                const c = candidatesInPos[0];
                const yesVotes = votesByCandidate[c.id] || 0;
                const noVotes = votesByCandidate[c.id + "_no"] || 0;
                if (yesVotes > noVotes) {
                    winners.push({ ...c, winnerType: 'Yes/No' });
                }
            } else {
                // Multi Candidate
                let winner = null;
                let maxVotes = -1;
                candidatesInPos.forEach(c => {
                    const votes = votesByCandidate[c.id] || 0;
                    if (votes > maxVotes) {
                        maxVotes = votes;
                        winner = c;
                    } else if (votes === maxVotes && maxVotes > 0) {
                        // Tie - could handle specifically, for now just picking the first
                    }
                });
                if (winner && maxVotes > 0) {
                    winners.push({ ...winner, winnerType: 'Standard' });
                }
            }
        });

        renderIDCards(winners);
    });
}

function renderIDCards(winners) {
    const container = document.getElementById("idCardContainer");
    if (!container) return;

    if (winners.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-light);">
                <div style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;">🪪</div>
                <h3>No winners identified yet</h3>
                <p>Wait for voting to conclude or ensure there are candidates with positive results.</p>
            </div>
        `;
    } else {
        container.innerHTML = winners.map((w, index) => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div class="id-card-wrapper" id="id-card-${index}">
                    <!-- Header -->
                    <div class="id-card-header">
                        <img src="assets/favico.ico" alt="YBS Logo" class="id-card-header-logo">
                        <div class="id-card-school">
                            Yeriel Bracha School
                            <small>Official Prefect Identification</small>
                        </div>
                    </div>

                    <!-- Photo -->
                    <div class="id-card-photo-area">
                        <div class="id-card-logo-bg"></div>
                        <div class="id-card-photo" style="background-image: url('${getCandidatePhoto(w)}'); ${getCandidatePhotoStyle(w)}"></div>
                    </div>

                    <!-- Details -->
                    <div class="id-card-details">
                        <div class="id-card-name">${w.name}</div>
                        <div class="id-card-position">${w.position}</div>
                        <div class="id-card-footer">
                            <span>OFFICIAL PREFECT ID</span>
                            <div class="id-card-year">2026/27</div>
                        </div>
                    </div>
                </div>
                <button onclick="downloadIDCard('${w.name.replace(/'/g, "\\'")}', 'id-card-${index}')" class="btn-primary no-print" style="padding: 5px 10px; font-size: 0.8rem; background: var(--accent);">⬇️ Download JPG</button>
            </div>
        `).join('');
    }
    toggleModal('idCardModal', true);
}

function downloadIDCard(candidateName, cardId) {
    const cardElement = document.getElementById(cardId);
    if (!cardElement) return;

    // Remove the background logo temporarily to prevent html2canvas .ico parsing errors
    const bgLogos = cardElement.querySelectorAll('.id-card-logo-bg');
    bgLogos.forEach(logo => logo.style.display = 'none');
    
    const headerLogos = cardElement.querySelectorAll('.id-card-header-logo');
    headerLogos.forEach(logo => logo.style.display = 'none');

    // Use allowTaint true to allow loading local file:// images without CORS errors
    html2canvas(cardElement, {
        scale: 3, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
    }).then(canvas => {
        // Restore logos
        bgLogos.forEach(logo => logo.style.display = 'block');
        headerLogos.forEach(logo => logo.style.display = 'block');

        try {
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const link = document.createElement('a');
            link.download = `${candidateName.replace(/[^a-z0-9]/gi, '_')}_ID_Card.jpg`;
            link.href = imgData;
            link.click();
        } catch (e) {
            console.error("toDataURL error:", e);
            alert("Security Error: Your browser is blocking the image download because you are running the app directly from your computer (file://). Please launch the app through a local web server (like VS Code Live Server) to fix this.");
        }
    }).catch(err => {
        // Restore logos in case of error
        bgLogos.forEach(logo => logo.style.display = 'block');
        headerLogos.forEach(logo => logo.style.display = 'block');
        
        console.error("Error generating ID card image:", err);
        alert("html2canvas Error: " + err.message);
        showToast("Failed to download ID card", "fail");
    });
}

function generatePrintableResults() {
    db.ref("votes").once("value", snap => {
        const votesByCandidate = {};
        snap.forEach(d => {
            votesByCandidate[d.key] = d.numChildren();
        });

        let tableHtml = `
            <div class="results-print-header">
                <img src="assets/favico.ico" style="width: 60px; height: 60px; margin-bottom: 10px;">
                <h1 style="color: var(--primary-dark); margin: 0; font-size: 1.8rem;">Yeriel Bracha School</h1>
                <p style="color: var(--text-light); margin: 5px 0;">Official 2026/27 Prefect Election Results</p>
                <div style="font-size: 0.8rem; color: #718096; margin-top: 5px;">Generated on: ${new Date().toLocaleString()}</div>
            </div>
            <table class="results-print-table">
                <thead>
                    <tr>
                        <th>Position</th>
                        <th>Candidate Name</th>
                        <th>Votes</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
        `;

        voterPositions.forEach(pos => {
            const candidatesInPos = allCandidates.filter(c => c.position === pos);
            if (candidatesInPos.length === 0) return;

            let totalPosVotes = 0;
            candidatesInPos.forEach(c => {
                totalPosVotes += (votesByCandidate[c.id] || 0);
                if (candidatesInPos.length === 1) {
                    totalPosVotes += (votesByCandidate[c.id + "_no"] || 0);
                }
            });

            if (candidatesInPos.length === 1) {
                const c = candidatesInPos[0];
                const yesVotes = votesByCandidate[c.id] || 0;
                const noVotes = votesByCandidate[c.id + "_no"] || 0;
                const total = yesVotes + noVotes;
                const yesPercent = total > 0 ? Math.round((yesVotes / total) * 100) : 0;
                const noPercent = total > 0 ? Math.round((noVotes / total) * 100) : 0;
                const isWinner = yesVotes > noVotes;

                tableHtml += `
                    <tr>
                        <td rowspan="2" style="font-weight: 700;">${pos}</td>
                        <td style="display: flex; align-items: center; gap: 10px;">
                            <div class="print-table-photo" style="background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                            <span>${c.name} (YES) ${isWinner ? '<span class="winner-tick">✔️</span>' : ''}</span>
                        </td>
                        <td>${yesVotes}</td>
                        <td>${yesPercent}%</td>
                    </tr>
                    <tr>
                        <td style="display: flex; align-items: center; gap: 10px;">
                            <div class="print-table-photo" style="background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                            <span>${c.name} (NO)</span>
                        </td>
                        <td>${noVotes}</td>
                        <td>${noPercent}%</td>
                    </tr>
                `;
            } else {
                candidatesInPos.sort((a, b) => (votesByCandidate[b.id] || 0) - (votesByCandidate[a.id] || 0));
                const maxVotes = votesByCandidate[candidatesInPos[0].id] || 0;

                candidatesInPos.forEach((c, index) => {
                    const votes = votesByCandidate[c.id] || 0;
                    const percent = totalPosVotes > 0 ? Math.round((votes / totalPosVotes) * 100) : 0;
                    const isWinner = votes > 0 && votes === maxVotes;

                    tableHtml += `
                        <tr>
                            ${index === 0 ? `<td rowspan="${candidatesInPos.length}" style="font-weight: 700;">${pos}</td>` : ''}
                            <td style="display: flex; align-items: center; gap: 10px;">
                                <div class="print-table-photo" style="background-image: url('${getCandidatePhoto(c)}'); ${getCandidatePhotoStyle(c)}"></div>
                                <span>${c.name} ${isWinner ? '<span class="winner-tick">✔️</span>' : ''}</span>
                            </td>
                            <td>${votes}</td>
                            <td>${percent}%</td>
                        </tr>
                    `;
                });
            }
        });

        tableHtml += `
                </tbody>
            </table>
            <div style="margin-top: 40px; text-align: right; font-size: 0.8rem; color: #718096;">
                <p>___________________________</p>
                <p>Electoral Commissioner Signature</p>
            </div>
        `;

        document.getElementById("resultsPrintContainer").innerHTML = tableHtml;
        toggleModal('resultsPrintModal', true);
    });
}
