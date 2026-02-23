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

// WIZARD STATE
let allCandidates = [];
const voterPositions = ['Headprefect', 'Chaplain', 'Sports & Health', 'Sanitation', 'Library & ICT Lab'];
let currentVoterStep = 0;
let voterSessionId = null;
let temporarySelections = {}; // Stores { positionName: candidateId }

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
}

function backToVetting() {
    document.getElementById("evaluationResultView").style.display = "none";
    document.getElementById("vettingSection").style.display = "block";
    if (activeResultsListener) {
        activeResultsListener();
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
            <td style="padding: 12px; font-weight: 600;">${c.name}</td>
            <td style="padding: 12px; font-size: 0.85rem; color: var(--text-light);">${c.position}</td>
            <td style="padding: 12px; text-align: right;">
                <button onclick="deleteCandidate('${c.id}', '${c.name}')" 
                    style="background: #f56565; padding: 5px 12px; font-size: 0.8rem; box-shadow: none;">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function deleteCandidate(id, name) {
    if (!confirm(`Are you sure you want to delete candidate "${name}"? This will also remove any votes they have received.`)) return;

    // Delete candidate
    db.ref("candidates/" + id).remove().then(() => {
        // Also delete their votes and scores
        db.ref("votes/" + id).remove();
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

        candidatesDiv.innerHTML = `
            <div class="candidate-vetting-card">
                <div class="card" style="border-left: 8px solid var(--primary); border-radius: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                        <button onclick="currentVettingPos = null; renderVettingStep();" style="background: none; color: var(--text-light); box-shadow: none; padding: 0;">← Back to Positions</button>
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary-dark);">${currentVettingPos}</span>
                    </div>

                    <div style="text-align: center; margin-bottom: 2rem;">
                        <div class="candidate-photo-large" style="margin-bottom: 1rem;"></div>
                        <h2 style="color: var(--primary-dark); margin: 0;">${candidate.name}</h2>
                        <p style="font-size: 0.8rem; margin-top: 10px; color: var(--text-light);">Candidate ${currentVettingCandidateIndex + 1} of ${filtered.length}</p>
                    </div>

                    <div class="score-inputs">
                        <div class="score-field"><label>Academic</label><input type="number" max="4" min="0" id="a${candidate.id}" placeholder="0-4"></div>
                        <div class="score-field"><label>Appearance</label><input type="number" max="4" min="0" id="b${candidate.id}" placeholder="0-4"></div>
                        <div class="score-field"><label>Discipline</label><input type="number" max="4" min="0" id="c${candidate.id}" placeholder="0-4"></div>
                        <div class="score-field"><label>Communication</label><input type="number" max="4" min="0" id="d${candidate.id}" placeholder="0-4"></div>
                        <div class="score-field"><label>Participation</label><input type="number" max="4" min="0" id="e${candidate.id}" placeholder="0-4"></div>
                    </div>

                    <div class="navigation-controls">
                        <button onclick="changeVettingIndex(-1)" style="background: var(--accent); flex: 1;" ${currentVettingCandidateIndex === 0 ? 'disabled' : ''}>← Previous</button>
                        <button onclick="submitScore('${candidate.id}','${candidate.position}', '${candidate.name}')" style="flex: 2;">Submit Evaluation</button>
                        
                        ${isLastCandidate ?
                `<button onclick="currentVettingPos = null; renderVettingStep();" style="background: #27ae60; flex: 1;">Done ✓</button>` :
                `<button onclick="changeVettingIndex(1)" style="background: var(--accent); flex: 1;">Next →</button>`
            }
                    </div>
                </div>
            </div>
        `;
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

        // Optional: Move to next candidate after submission
        const filtered = allCandidates.filter(c => c.position === currentVettingPos);
        if (currentVettingCandidateIndex < filtered.length - 1) {
            changeVettingIndex(1);
        } else {
            // If last candidate, go back to positions
            currentVettingPos = null;
            renderVettingStep();
        }
    }).catch(err => {
        console.error("Submission error:", err);
        showToast("Error submitting evaluation.", "fail");
    });
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
    voteListDiv.innerHTML = "";
    voteListDiv.style.display = "block";
    finishView.style.display = "none";
    if (wizardHeader) wizardHeader.style.display = "block";
    if (wizardNav) wizardNav.style.display = "flex";

    if (positionTitle) positionTitle.innerText = pos;
    if (stepIndicator) stepIndicator.innerText = `Step ${currentVoterStep + 1} of ${voterPositions.length}`;

    // Filter candidates for this position
    const filtered = allCandidates.filter(c => c.position === pos);

    if (filtered.length === 0) {
        voteListDiv.innerHTML = `<div class="card" style="text-align: center; color: var(--text-light); padding: 3rem;">No candidates registered for ${pos}.</div>`;
        if (btnNext) {
            btnNext.disabled = false;
            btnNext.innerText = "Skip Position →";
        }
    } else {
        filtered.forEach(c => {
            const isSelected = selectedId === c.id;
            voteListDiv.innerHTML += `
                <div class="card candidate-card ${isSelected ? 'selected-candidate' : ''}" style="display: flex; gap: 15px; align-items: center; border-radius: 12px; animation: fadeIn 0.3s ease-out; border-left: 5px solid var(--primary); cursor: pointer;" onclick="selectCandidate('${c.id}', '${pos}')">
                    <div class="candidate-photo" style="width: 45px; height: 45px; border-color: var(--primary);"></div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; color: var(--primary-dark); font-size: 1.1rem;">${c.name}</div>
                    </div>
                    <button class="btn-vote" style="padding: 10px 20px;">${isSelected ? 'Selected' : 'Vote'}</button>
                </div>
            `;
        });

        if (btnNext) {
            btnNext.disabled = !selectedId;
            btnNext.innerText = selectedId ?
                (currentVoterStep === voterPositions.length - 1 ? "Finish Voting ✓" : "Confirm & Next Position →") :
                "Select a candidate to continue";
        }
    }
}

function selectCandidate(candidateId, position) {
    temporarySelections[position] = candidateId;
    renderVoterStep();
    showToast("Selected: " + allCandidates.find(c => c.id === candidateId).name, "success");
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
    // Admin Stats
    db.ref("candidates").once("value", snap => {
        const count = snap.numChildren();
        document.getElementById("statCandidates").innerText = count;

        db.ref("scores").once("value", scoreSnap => {
            const vettedCount = scoreSnap.numChildren();
            const progress = count > 0 ? Math.round((vettedCount / count) * 100) : 0;
            document.getElementById("statVetting").innerText = progress + "%";

            // Vetting Page Stats
            document.getElementById("statVettedCount").innerText = vettedCount;
        });
    });

    db.ref("votes").on("value", snap => {
        let totalVotes = 0;
        snap.forEach(d => totalVotes += d.numChildren());
        document.getElementById("statVotes").innerText = totalVotes;
    });
}

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
    const posInput = document.getElementById("position");

    if (!nameInput.value || !posInput.value) {
        showToast("Please fill all fields", "fail");
        return;
    }

    let id = Date.now();
    db.ref("candidates/" + id).set({
        name: nameInput.value,
        position: posInput.value
    }).then(() => {
        showToast("Candidate Saved Successfully", "success");
        addActivityLog(`Candidate Added: ${nameInput.value}`);
        nameInput.value = "";
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
        const wizardNav = document.querySelector(".wizard-nav");
        if (wizardHeader) wizardHeader.style.display = "none";
        if (wizardNav) wizardNav.style.display = "none";
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
        candidatesInPos.forEach(c => totalPosVotes += (votesByCandidate[c.id] || 0));

        let groupHtml = `
            <div class="position-group-card card">
                <div class="position-header">
                    <span>${pos}</span>
                    <span style="color: var(--text-light); font-size: 0.75rem;">Total: ${totalPosVotes} votes</span>
                </div>
        `;

        candidatesInPos.sort((a, b) => (votesByCandidate[b.id] || 0) - (votesByCandidate[a.id] || 0));

        candidatesInPos.forEach(c => {
            const votes = votesByCandidate[c.id] || 0;
            const percent = totalPosVotes > 0 ? Math.round((votes / totalPosVotes) * 100) : 0;

            groupHtml += `
                <div class="candidate-result-item">
                    <div class="vote-info">
                        <span>${c.name}</span>
                        <span>${votes} <small>(${percent}%)</small></span>
                    </div>
                    <div class="vote-bar-container">
                        <div class="vote-bar-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
        });

        groupHtml += `</div>`;
        resultsDiv.innerHTML += groupHtml;
    });

    if (allCandidates.length === 0) {
        resultsDiv.innerHTML = `<div style="text-align: center; color: var(--text-light); padding: 3rem; grid-column: 1/-1;">Waiting for candidate registration...</div>`;
    }
});
