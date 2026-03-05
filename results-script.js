const firebaseConfig = {
    apiKey: "AIzaSyDEdZ_FfP2I1vv4-qfGYP7YCuXvCORLY2w",
    authDomain: "tracha-xx.firebaseapp.com",
    databaseURL: "https://tracha-xx-default-rtdb.firebaseio.com",
    projectId: "tracha-xx",
    storageBucket: "tracha-xx.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const voterPositions = ['Headprefect', 'Assistant Headprefect', 'Chaplain', 'Assistant Chaplain', 'Sports & Health', 'Sanitation', 'Library & ICT Lab'];

const PHOTO_MAPPING = {
    "Addo, Yaa Koramah": { url: "assets/Addo, Yaa Koramah.png" },
    "Adu Darko, Samuel": { url: "assets/Adu Darko, Samuel.png" },
    "Agbleke, Elinam": { url: "assets/Agbleke, Elinam.png" },
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
        if (mapping.zoom) return `background-size: ${mapping.zoom}; background-repeat: no-repeat; background-position: center;`;
        if (mapping.zoomOut) return "background-size: contain; background-repeat: no-repeat; background-position: center;";
    }
    return "";
}

let allCandidates = [];

// Real-time Update Logic
db.ref("candidates").on("value", candSnap => {
    allCandidates = [];
    candSnap.forEach(d => {
        allCandidates.push({ id: d.key, ...d.val() });
    });
    refreshResults();
});

db.ref("votes").on("value", () => {
    refreshResults();
});

function refreshResults() {
    const resultsDiv = document.getElementById("groupedResults");
    if (!resultsDiv) return;

    db.ref("votes").once("value", voteSnap => {
        let votesByCandidate = {};
        voteSnap.forEach(d => {
            votesByCandidate[d.key] = d.numChildren();
        });

        resultsDiv.innerHTML = "";

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
                                
                                <div style="margin-bottom: 10px;">
                                    <div class="vote-info">
                                        <span style="color: #2f855a;">YES Votes</span>
                                        <span style="color: #2f855a;">${yesVotes} <small>(${yesPercent}%)</small></span>
                                    </div>
                                    <div class="vote-bar-container" style="background: rgba(72, 187, 120, 0.1);">
                                        <div class="vote-bar-fill" style="width: ${yesPercent}%; background: #48bb78;"></div>
                                    </div>
                                </div>

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
                                    <div class="vote-info"><span>${c.name}</span><span>${votes} <small>(${percent}%)</small></span></div>
                                    <div class="vote-bar-container"><div class="vote-bar-fill" style="width: ${percent}%"></div></div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }
            groupHtml += `</div>`;
            resultsDiv.innerHTML += groupHtml;
        });
    });
}
