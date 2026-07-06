import { getContext } from '../../../extensions.js';

let currentImages = []; 
let selectedImages = new Set();
let favoriteImages = new Set(JSON.parse(localStorage.getItem('advGalleryFavs')) || []);
let isSelectMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

const template = `
<div id="adv-gallery-popup" style="display:none; position:fixed; top:5vh; left:5vw; width:90vw; height:90vh; min-width:320px; min-height:400px; resize:both; overflow:hidden; background:var(--SmartThemeBlurTintColor, #1a1a1a); backdrop-filter:blur(10px); border:1px solid var(--SmartThemeBorderColor, #444); border-radius:12px; z-index:9999; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    
    <!-- 상단 컨트롤 바 -->
    <div id="adv-gallery-controls" style="display:flex; align-items:center; gap:8px; padding:10px; border-bottom:1px solid var(--SmartThemeBorderColor, #444); background:rgba(0,0,0,0.2); overflow-x:auto; flex-shrink:0; white-space:nowrap;">
        
        <select class="adv-ctrl-item" id="adv-char-select" title="캐릭터 선택" style="padding:5px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555;">
            <option value="">👤 캐릭터 선택</option>
        </select>
        <span id="adv-char-size" style="font-size:12px; opacity:0.6; padding-right:5px;"></span>
        
        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬" style="padding:5px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555;">
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="size">용량순</option>
        </select>
        
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수" style="padding:5px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555;">
            <option value="4">4장 보기</option><option value="8" selected>8장 보기</option><option value="20">20장 보기</option>
        </select>
        
        <!-- 우측 아이콘 버튼들 -->
        <div style="margin-left:auto; display:flex; gap:8px;">
            <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드" style="width:32px; height:32px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555; cursor:pointer;"><i class="fa-solid fa-check-double"></i></button>
            <button class="adv-ctrl-item" id="adv-btn-close" title="닫기" style="width:32px; height:32px; border-radius:5px; background:rgba(255,77,77,0.2); color:#ff4d4d; border:1px solid rgba(255,77,77,0.5); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        </div>
    </div>

    <!-- 다중 선택 모드 액션 바 -->
    <div id="adv-selection-actions" style="display:none; padding:8px 10px; gap:10px; align-items:center; background:rgba(255,64,129,0.15); border-bottom:1px solid #ff4081; flex-shrink:0; overflow-x:auto; white-space:nowrap;">
        <button class="adv-ctrl-item" id="adv-btn-sel-all" style="padding:5px 10px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-check-square"></i> 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel" style="padding:5px 10px; border-radius:5px; background:rgba(255,77,77,0.2); color:#ff4d4d; border:none; cursor:pointer; font-weight:bold;"><i class="fa-solid fa-trash"></i> 삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" style="padding:5px 10px; border-radius:5px; background:rgba(255,165,0,0.2); color:orange; border:none; cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i> 제외삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel" style="padding:5px 10px; border-radius:5px; background:rgba(76,175,80,0.2); color:#4caf50; border:none; cursor:pointer;"><i class="fa-solid fa-download"></i> 저장</button>
    </div>

    <!-- 이미지 그리드 영역 -->
    <div id="adv-gallery-container" style="flex-grow:1; overflow-y:auto; padding:15px; display:grid; gap:10px; grid-template-columns:repeat(var(--columns, 4), 1fr); align-content:start;"></div>

    <!-- 하단 페이징 -->
    <div id="adv-pagination" style="display:flex; justify-content:center; gap:15px; padding:10px; border-top:1px solid var(--SmartThemeBorderColor, #444); background:rgba(0,0,0,0.2); flex-shrink:0;">
        <button class="adv-ctrl-item" id="adv-btn-prev-page" style="width:36px; height:30px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-chevron-left"></i></button>
        <span id="adv-page-info" style="align-self:center; font-size:13px; opacity:0.8;">1 / 1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page" style="width:36px; height:30px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>

<!-- 라이트박스 (크게보기) -->
<div id="adv-lightbox" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:10000; flex-direction:column; justify-content:center; align-items:center;">
    <img id="adv-lightbox-img" src="" style="max-width:90vw; max-height:80vh; object-fit:contain; border-radius:8px;">
    <div id="adv-lightbox-nav" style="position:absolute; bottom:20px; display:flex; gap:15px;">
        <button class="adv-nav-btn" id="adv-nav-left" style="padding:10px 15px; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:8px; cursor:pointer; backdrop-filter:blur(5px);"><i class="fa-solid fa-chevron-left"></i> 이전</button>
        <button class="adv-nav-btn" id="adv-btn-copy-prompt" style="padding:10px 15px; background:rgba(255,213,79,0.2); color:#ffd54f; font-weight:bold; border:1px solid rgba(255,213,79,0.5); border-radius:8px; cursor:pointer;"><i class="fa-solid fa-clipboard"></i> 프롬프트 복사</button>
        <button class="adv-nav-btn" id="adv-nav-right" style="padding:10px 15px; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:8px; cursor:pointer; backdrop-filter:blur(5px);">다음 <i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>
`;

window.advGalleryCache = {};

// 1. 초기화 및 메뉴 버튼 추가
function addWandMenuButtons() {
    var menu = document.getElementById('extensionsMenu');
    if (!menu) return;

    if (!document.getElementById('adv-gallery-menu-btn')) {
        var btn = document.createElement('div');
        btn.id = 'adv-gallery-menu-btn';
        btn.className = 'list-group-item flex-container flexGap5';
        btn.innerHTML = '<div class="fa-solid fa-images extensionsMenuExtensionButton" style="color:#ff4081;"></div><span>갤러리</span>';

        btn.addEventListener('click', function () {
            document.getElementById('adv-gallery-popup').style.display = 'flex';
            document.getElementById('extensionsMenuButton')?.click();
            populateCharacters(); // 캐릭터 리스트 즉시 업데이트
        });
        menu.appendChild(btn);
    }
}

// 2. 캐릭터 목록 불러오기 (실리태번 기본 정렬 = 최근 대화순 그대로 적용)
function populateCharacters() {
    const select = document.getElementById('adv-char-select');
    select.innerHTML = '<option value="">👤 캐릭터 선택</option>';
    const context = getContext();
    
    if (context.characters) {
        context.characters.forEach(c => {
            select.innerHTML += `<option value="${c.avatar}">${c.name}</option>`;
        });
    }
}

// 3. ★핵심: 선택된 캐릭터의 "과거 모든 채팅 기록"을 딥스캔하여 이미지를 찾아냄
async function loadAndSortImages(avatarName) {
    document.getElementById('adv-char-size').innerText = '';
    const container = document.getElementById('adv-gallery-container');
    
    if (!avatarName) { 
        currentImages = []; 
        applySortAndRender(); 
        return; 
    }

    // 캐싱: 이미 스캔했던 캐릭터면 로딩 없이 바로 띄움
    if (window.advGalleryCache && window.advGalleryCache[avatarName]) {
        currentImages = [...window.advGalleryCache[avatarName]];
        applySortAndRender();
        return;
    }

    // 스캔 진행 중 표시
    container.innerHTML = '<p style="text-align:center; padding-top:40px; width:100%; grid-column:1/-1; color:#ff4081; font-weight:bold;">과거 채팅 기록을 딥스캔 중입니다... ⏳<br><span style="font-size:12px; color:#aaa; font-weight:normal;">이 캐릭터에서 생성된 모든 이미지를 찾고 있습니다. 잠시만 기다려주세요.</span></p>';
    
    const context = getContext();
    const char = context.characters.find(c => c.avatar === avatarName);
    let foundImages = new Set();
    
    try {
        // (1) 해당 캐릭터의 모든 채팅 파일(.jsonl) 목록을 서버에 요청
        const chatListRes = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': context.csrf_token },
            body: JSON.stringify({ avatar: avatarName })
        });
        
        if (chatListRes.ok) {
            const chatsData = await chatListRes.json();
            const chatFiles = Object.keys(chatsData);

            // (2) 모든 채팅 파일을 동시에 뜯어보며 이미지 태그(<img src="...">) 수집
            const chatPromises = chatFiles.map(async (fileName) => {
                try {
                    const chatRes = await fetch('/api/chats/get', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': context.csrf_token },
                        body: JSON.stringify({ ch_name: char.name, file_name: fileName, avatar_url: avatarName })
                    });
                    
                    if (chatRes.ok) {
                        const chatLog = await chatRes.json();
                        const messages = Array.isArray(chatLog) ? chatLog : (chatLog.mes || []);
                        
                        messages.forEach(msg => {
                            if (msg.extra && msg.extra.image) foundImages.add(msg.extra.image);
                            if (msg.mes) {
                                const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
                                let match;
                                while ((match = imgRegex.exec(msg.mes)) !== null) {
                                    if (!match[1].startsWith('data:')) foundImages.add(match[1]); // base64 제외
                                }
                            }
                        });
                    }
                } catch (err) {}
            });

            await Promise.all(chatPromises); // 병렬 스캔 완료 대기
        }
    } catch (e) {
        console.error("채팅 스캔 오류:", e);
    }

    currentImages = Array.from(foundImages);
    
    if (currentImages.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding-top:40px; width:100%; grid-column:1/-1; color:#aaa;">이 캐릭터에는 생성된 이미지가 없습니다.</p>';
        return;
    }

    // 스캔 완료된 결과 메모리에 저장
    if (!window.advGalleryCache) window.advGalleryCache = {};
    window.advGalleryCache[avatarName] = [...currentImages];

    applySortAndRender();
}

function applySortAndRender() {
    const sortType = document.getElementById('adv-sort-select').value;
    
    // 채팅에서 긁어온 경로는 시간순으로 저장되어 있으므로 reverse()하면 최신순이 됨
    if (sortType === 'newest') currentImages.reverse();
    else if (sortType === 'oldest') currentImages.sort();
    else if (sortType === 'size') currentImages.sort((a, b) => b.length - a.length);

    currentPage = 1;
    selectedImages.clear();
    document.getElementById('adv-sel-count').innerText = '0';
    
    renderGrid();
    calculateTotalSize(currentImages);
}

// 4. 화면 렌더링 및 용량 계산
function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    if(!currentImages || currentImages.length === 0) return;
    
    container.innerHTML = '';
    container.style.setProperty('--columns', itemsPerPage == 4 ? 2 : (itemsPerPage == 8 ? 4 : 6));

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    document.getElementById('adv-page-info').textContent = `${currentPage} / ${totalPages}`;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageImages = currentImages.slice(startIdx, startIdx + itemsPerPage);

    pageImages.forEach((src, idx) => {
        const card = document.createElement('div');
        card.style.cssText = `position:relative; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:rgba(0,0,0,0.3); cursor:pointer; transition:transform 0.1s; border: 2px solid ${selectedImages.has(src) ? '#ff4081' : 'transparent'};`;
        card.onmouseover = () => card.style.transform = 'scale(1.03)';
        card.onmouseout = () => card.style.transform = 'scale(1)';

        const favBtn = document.createElement('button');
        favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
        favBtn.style.cssText = `position:absolute; top:5px; left:5px; width:28px; height:28px; background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:${favoriteImages.has(src) ? '#ffd54f' : 'white'}; cursor:pointer; z-index:10; font-size:12px;`;
        
        favBtn.onclick = (e) => {
            e.stopPropagation();
            if (favoriteImages.has(src)) favoriteImages.delete(src); else favoriteImages.add(src);
            localStorage.setItem('advGalleryFavs', JSON.stringify([...favoriteImages]));
            favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
            favBtn.style.color = favoriteImages.has(src) ? '#ffd54f' : 'white';
        };

        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = "width:100%; height:100%; object-fit:cover;";
        
        card.appendChild(favBtn);
        card.appendChild(img);

        if(selectedImages.has(src)) {
            const check = document.createElement('div');
            check.innerHTML = '<i class="fa-solid fa-check"></i>';
            check.style.cssText = 'position:absolute; top:5px; right:5px; width:24px; height:24px; background:#ff4081; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px;';
            card.appendChild(check);
        }

        card.onclick = () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) selectedImages.delete(src); else selectedImages.add(src);
                document.getElementById('adv-sel-count').innerText = selectedImages.size;
                renderGrid(); 
            } else {
                currentLightboxIndex = startIdx + idx;
                document.getElementById('adv-lightbox-img').src = src;
                document.getElementById('adv-lightbox').style.display = 'flex';
            }
        };
        container.appendChild(card);
    });
}

async function calculateTotalSize(images) {
    const sizeSpan = document.getElementById('adv-char-size');
    if (images.length === 0) { sizeSpan.innerText = '(0MB)'; return; }

    sizeSpan.innerText = '(용량 계산 중...)';
    let totalSize = 0;
    try {
        for (let i = 0; i < images.length; i += 20) {
            const chunk = images.slice(i, i + 20);
            await Promise.all(chunk.map(async (src) => {
                try {
                    const res = await fetch(src, { method: 'HEAD' });
                    const size = res.headers.get('content-length');
                    if (size) totalSize += parseInt(size, 10);
                } catch(e) {}
            }));
        }
        sizeSpan.innerText = `(${(totalSize / (1024 * 1024)).toFixed(2)}MB)`;
    } catch(e) { sizeSpan.innerText = '(계산 실패)'; }
}

// 5. 기타 이벤트 연동 및 삭제 로직
function bindEvents() {
    document.getElementById('adv-btn-close').onclick = () => document.getElementById('adv-gallery-popup').style.display = 'none';

    document.getElementById('adv-char-select').onchange = (e) => loadAndSortImages(e.target.value);
    document.getElementById('adv-sort-select').onchange = () => applySortAndRender();
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.currentTarget.style.background = isSelectMode ? 'rgba(255,64,129,0.5)' : 'rgba(255,255,255,0.1)';
        document.getElementById('adv-selection-actions').style.display = isSelectMode ? 'flex' : 'none';
        selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0'; renderGrid();
    };

    document.getElementById('adv-btn-sel-all').onclick = () => {
        currentImages.forEach(src => selectedImages.add(src));
        document.getElementById('adv-sel-count').innerText = selectedImages.size; renderGrid();
    };
    document.getElementById('adv-btn-del-sel').onclick = () => deleteTargetImages(Array.from(selectedImages));
    document.getElementById('adv-btn-del-unsel').onclick = () => deleteTargetImages(currentImages.filter(src => !selectedImages.has(src)));
    document.getElementById('adv-btn-save-sel').onclick = () => {
        selectedImages.forEach(src => {
            const a = document.createElement('a'); a.href = src; a.download = src.split('/').pop();
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    };

    document.getElementById('adv-nav-left').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
    document.getElementById('adv-nav-right').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
    document.getElementById('adv-lightbox').onclick = (e) => { if(e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
}

async function deleteTargetImages(targetArray) {
    const toDelete = targetArray.filter(src => !favoriteImages.has(src));
    if (toDelete.length === 0) return alert("삭제할 이미지가 없거나 모두 ⭐ 즐겨찾기로 보호되어 있습니다.");

    if (!confirm(`즐겨찾기된 이미지를 제외한 ${toDelete.length}장을 영구 삭제합니다. 진행할까요?`)) return;

    for (let src of toDelete) {
        // CSRF 토큰을 첨부하여 실리태번의 삭제 API 호출
        await fetch('/api/images/delete', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json', 'X-CSRF-Token': getContext().csrf_token}, 
            body: JSON.stringify({path: src}) 
        });
        
        currentImages = currentImages.filter(img => img !== src);
        const currentAvatar = document.getElementById('adv-char-select').value;
        if(currentAvatar && window.advGalleryCache[currentAvatar]) {
            window.advGalleryCache[currentAvatar] = window.advGalleryCache[currentAvatar].filter(img => img !== src);
        }
    }
    
    selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0';
    renderGrid();
    calculateTotalSize(currentImages);
    alert('삭제 완료!');
}

jQuery(async function () {
    document.body.insertAdjacentHTML('beforeend', template);
    addWandMenuButtons();
    bindEvents();
});
