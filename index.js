import { getContext } from "../../../extensions.js";

let currentImages = [];
let selectedImages = new Set();
let favoriteImages = new Set(JSON.parse(localStorage.getItem('advGalleryFavs')) || []);
let isSelectMode = false;
let isMetaMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

// 아이콘 위주의 깔끔한 UI 템플릿
const template = `
<div id="adv-gallery-popup" style="display:none;">
    <!-- 메인 컨트롤 패널 -->
    <div id="adv-gallery-controls">
        <select class="adv-ctrl-item" id="adv-char-select" title="캐릭터 선택"><option value="">👤 선택</option></select>
        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬">
            <option value="newest">🕒 최신순</option>
            <option value="oldest">⏳ 오래된순</option>
            <option value="size">⚖️ 크기순(임시)</option>
        </select>
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수">
            <option value="4">🔲 4</option><option value="8" selected>🔲 8</option>
            <option value="20">🔲 20</option>
        </select>
        
        <button class="adv-ctrl-item" id="adv-btn-meta" title="프롬프트 보기">📝</button>
        <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드">✅</button>
        <button class="adv-ctrl-item" id="adv-btn-close" title="닫기">❌</button>
    </div>
    
    <!-- 선택 모드 액션 바 (즐겨찾기 보호됨) -->
    <div id="adv-selection-actions" style="display:none; background: rgba(255,64,129,0.1); border-bottom: 1px solid #ff4081;">
        <button class="adv-ctrl-item" id="adv-btn-sel-all">☑️ 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel" style="color:#ff4d4d;">🗑️ 삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" style="color:orange;">⚠️ 반전삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel" style="color:#4caf50;">💾 저장</button>
    </div>

    <!-- 갤러리 영역 -->
    <div id="adv-gallery-container"></div>
    
    <!-- 페이징 -->
    <div style="display:flex; justify-content:center; gap:10px; padding:10px; border-top:1px solid #555;">
        <button class="adv-ctrl-item" id="adv-btn-prev-page">◀</button>
        <span id="adv-page-info" style="align-self:center;">1/1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page">▶</button>
    </div>
</div>

<!-- 라이트박스 -->
<div id="adv-lightbox">
    <img id="adv-lightbox-img" src="">
    <!-- 프롬프트 복사 & 하단 네비게이션 -->
    <div id="adv-lightbox-nav">
        <button class="adv-nav-btn" id="adv-nav-left">◀</button>
        <button class="adv-nav-btn" id="adv-btn-copy-prompt" title="프롬프트를 채팅창에 복사">📋 프롬프트 복사</button>
        <button class="adv-nav-btn" id="adv-nav-right">▶</button>
    </div>
</div>
`;

// 초기화
async function init() {
    document.body.insertAdjacentHTML('beforeend', template);
    const injectBtn = setInterval(() => {
        const extMenu = document.getElementById('extensionsMenu');
        if (extMenu) {
            const btn = document.createElement('div');
            btn.className = 'list-group-item flex-container flexGap5';
            btn.innerHTML = `<span>🖼️ 갤러리 (Adv)</span>`;
            btn.addEventListener('click', openGallery);
            extMenu.appendChild(btn);
            clearInterval(injectBtn);
        }
    }, 1000);
    bindEvents();
}

function openGallery() {
    document.getElementById('adv-gallery-popup').style.display = 'flex';
    const context = getContext();
    const select = document.getElementById('adv-char-select');
    select.innerHTML = '<option value="">👤 선택</option>';
    if (context.characters) {
        context.characters.forEach(c => {
            select.innerHTML += `<option value="${c.avatar}">${c.name}</option>`;
        });
    }
}

// 서버 이미지 로드 및 정렬
async function loadAndSortImages(charAvatar) {
    if (!charAvatar) return;
    try {
        const res = await fetch('/api/images/get'); 
        let data = await res.json();
        let allFiles = Array.isArray(data) ? data : (data.images || []);
        
        currentImages = allFiles.filter(img => img.includes(charAvatar.split('.')[0]));
        
        // 정렬 로직 (파일명에 포함된 타임스탬프 기준)
        const sortType = document.getElementById('adv-sort-select').value;
        if (sortType === 'newest') {
            currentImages.sort().reverse(); // 최신순 (이름 역순)
        } else if (sortType === 'oldest') {
            currentImages.sort(); // 오래된순
        } else if (sortType === 'size') {
            // 크기순 정렬 (API에서 크기를 안 주므로 이름 길이로 임시 대체 - ST 한계)
            currentImages.sort((a, b) => b.length - a.length);
        }

        currentPage = 1;
        renderGrid();
    } catch(e) { console.error(e); }
}

// 그리드 렌더링
function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    container.innerHTML = '';
    container.style.setProperty('--columns', itemsPerPage == 4 ? 2 : (itemsPerPage == 8 ? 4 : 6));

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    document.getElementById('adv-page-info').textContent = `${currentPage}/${totalPages}`;
    
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageImages = currentImages.slice(startIdx, startIdx + itemsPerPage);

    pageImages.forEach((src, idx) => {
        const card = document.createElement('div');
        card.className = `adv-img-card ${selectedImages.has(src) ? 'selected' : ''}`;
        
        // 즐겨찾기 버튼
        const favBtn = document.createElement('button');
        favBtn.className = `adv-btn-fav ${favoriteImages.has(src) ? 'active' : ''}`;
        favBtn.innerHTML = favoriteImages.has(src) ? '⭐' : '☆';
        favBtn.onclick = (e) => {
            e.stopPropagation(); // 클릭 시 이미지 확대 방지
            if (favoriteImages.has(src)) favoriteImages.delete(src);
            else favoriteImages.add(src);
            localStorage.setItem('advGalleryFavs', JSON.stringify([...favoriteImages]));
            favBtn.innerHTML = favoriteImages.has(src) ? '⭐' : '☆';
            favBtn.classList.toggle('active');
        };

        const img = document.createElement('img');
        img.src = src;

        card.appendChild(favBtn);
        card.appendChild(img);
        
        if (isMetaMode) {
            const meta = document.createElement('div');
            meta.style.cssText = 'position:absolute; bottom:0; background:rgba(0,0,0,0.8); font-size:10px; padding:5px; width:100%;';
            meta.innerText = "프롬프트 데이터 (API 연동 필요)";
            card.appendChild(meta);
        }

        card.onclick = () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) { selectedImages.delete(src); card.classList.remove('selected'); }
                else { selectedImages.add(src); card.classList.add('selected'); }
                document.getElementById('adv-sel-count').innerText = selectedImages.size;
            } else {
                currentLightboxIndex = startIdx + idx;
                document.getElementById('adv-lightbox-img').src = src;
                document.getElementById('adv-lightbox').style.display = 'flex';
            }
        };
        container.appendChild(card);
    });
}

// 이벤트 바인딩
function bindEvents() {
    document.getElementById('adv-btn-close').onclick = () => document.getElementById('adv-gallery-popup').style.display = 'none';
    
    document.getElementById('adv-char-select').onchange = (e) => loadAndSortImages(e.target.value);
    document.getElementById('adv-sort-select').onchange = () => loadAndSortImages(document.getElementById('adv-char-select').value);
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-btn-meta').onclick = (e) => {
        isMetaMode = !isMetaMode;
        e.target.style.background = isMetaMode ? '#555' : '';
        renderGrid();
    };

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.target.style.background = isSelectMode ? '#555' : '';
        document.getElementById('adv-selection-actions').style.display = isSelectMode ? 'flex' : 'none';
        selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0'; renderGrid();
    };

    document.getElementById('adv-btn-sel-all').onclick = () => {
        currentImages.forEach(src => selectedImages.add(src));
        document.getElementById('adv-sel-count').innerText = selectedImages.size; renderGrid();
    };

    document.getElementById('adv-btn-del-sel').onclick = () => deleteTargetImages(Array.from(selectedImages));
    document.getElementById('adv-btn-del-unsel').onclick = () => {
        const unsel = currentImages.filter(src => !selectedImages.has(src));
        deleteTargetImages(unsel);
    };

    document.getElementById('adv-btn-save-sel').onclick = () => {
        selectedImages.forEach(src => {
            const a = document.createElement('a'); a.href = src; a.download = src.split('/').pop();
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    };

    // 하단 네비게이션 작동
    document.getElementById('adv-nav-left').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
    document.getElementById('adv-nav-right').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
    document.getElementById('adv-lightbox').onclick = (e) => { if(e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };

    // 프롬프트 복사 & 채팅창 삽입 로직
    document.getElementById('adv-btn-copy-prompt').onclick = (e) => {
        e.stopPropagation();
        const dummyPrompt = "masterpiece, best quality, 1girl, blonde hair, smiling"; // 실제 메타데이터 추출 연동 필요
        
        // 1. 클립보드 복사
        navigator.clipboard.writeText(dummyPrompt).then(() => {
            alert("프롬프트가 클립보드에 복사되었습니다.");
        });

        // 2. 실리태번 채팅 입력창(textarea)에 바로 텍스트 추가
        const chatInput = document.getElementById('send_textarea');
        if (chatInput) {
            chatInput.value += (chatInput.value ? ", " : "") + dummyPrompt;
            chatInput.dispatchEvent(new Event('input', { bubbles: true })); // ST가 텍스트 변화를 인식하게 함
        }
    };
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
}

// 안전한 삭제 (즐겨찾기 보호)
async function deleteTargetImages(targetArray) {
    const toDelete = targetArray.filter(src => !favoriteImages.has(src)); // 즐겨찾기는 삭제 목록에서 제외
    
    if (toDelete.length === 0) return alert("삭제할 이미지가 없거나 모두 즐겨찾기로 보호되어 있습니다.");
    if (!confirm(`즐겨찾기된 이미지를 제외한 ${toDelete.length}장을 영구 삭제합니다. 진행할까요?`)) return;

    for (let src of toDelete) {
        await fetch('/api/images/delete', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: src})
        });
        currentImages = currentImages.filter(img => img !== src);
    }
    
    selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0';
    renderGrid(); alert('삭제 완료!');
}

jQuery(document).ready(init);
