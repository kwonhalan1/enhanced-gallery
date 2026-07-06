import { getContext } from "../../../extensions.js";

let selectedImages = new Set();
let isSelectMode = false;
let allImagePaths = [];

// UI HTML 템플릿 삽입
const galleryHTML = `
<div id="enh-gallery-modal">
    <div id="enh-gallery-header">
        <h2>🖼️ 전체 이미지 갤러리</h2>
        <div class="enh-btn-group">
            <button id="enh-btn-toggle-mode">선택 모드 켜기</button>
            <button id="enh-btn-select-all" style="display:none;">전체 선택</button>
            <button id="enh-btn-delete" style="display:none;">선택 삭제 (<span id="enh-sel-count">0</span>)</button>
            <button id="enh-btn-close">닫기</button>
        </div>
    </div>
    <div id="enh-gallery-grid"></div>
</div>
<div id="enh-lightbox">
    <img id="enh-lightbox-img" src="" alt="Enlarged">
</div>
`;

// 서버에서 모든 이미지 가져오기
async function fetchAllImages() {
    try {
        // 실리태번의 내장 API를 사용하여 이미지 목록을 가져옵니다. (SD 생성 이미지, 아바타 등)
        // 만약 특정 폴더(SD 등)만 가져오고 싶다면 API 엔드포인트를 변경해야 할 수 있습니다.
        const response = await fetch('/api/images/get'); 
        if (response.ok) {
            const data = await response.json();
            // 데이터 형태가 배열이라고 가정 (실제 ST 버전에 따라 구조가 다를 수 있음)
            allImagePaths = Array.isArray(data) ? data : data.images || []; 
            renderGrid(allImagePaths);
        } else {
            console.error("이미지 목록을 불러오지 못했습니다.");
        }
    } catch (err) {
        console.error("API 통신 에러:", err);
    }
}

// 그리드에 이미지 렌더링
function renderGrid(images) {
    const grid = document.getElementById('enh-gallery-grid');
    grid.innerHTML = '';
    selectedImages.clear();
    updateCountUI();

    if (images.length === 0) {
        grid.innerHTML = '<p style="color:white;">표시할 이미지가 없습니다.</p>';
        return;
    }

    images.forEach(src => {
        const item = document.createElement('div');
        item.className = 'enh-gallery-item';
        item.dataset.src = src;

        const img = document.createElement('img');
        img.src = src;
        
        item.appendChild(img);
        grid.appendChild(item);

        // 클릭 이벤트 (선택 or 확대)
        item.addEventListener('click', () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) {
                    selectedImages.delete(src);
                    item.classList.remove('selected');
                } else {
                    selectedImages.add(src);
                    item.classList.add('selected');
                }
                updateCountUI();
            } else {
                const lightbox = document.getElementById('enh-lightbox');
                document.getElementById('enh-lightbox-img').src = src;
                lightbox.style.display = 'flex';
            }
        });
    });
}

// 모드 토글 및 UI 업데이트
function updateModeUI() {
    const btnMode = document.getElementById('enh-btn-toggle-mode');
    const btnSelectAll = document.getElementById('enh-btn-select-all');
    const btnDelete = document.getElementById('enh-btn-delete');
    
    if (isSelectMode) {
        btnMode.textContent = '선택 모드 끄기';
        btnSelectAll.style.display = 'inline-block';
        btnDelete.style.display = 'inline-block';
    } else {
        btnMode.textContent = '선택 모드 켜기';
        btnSelectAll.style.display = 'none';
        btnDelete.style.display = 'none';
        
        selectedImages.clear();
        updateCountUI();
        document.querySelectorAll('.enh-gallery-item').forEach(item => item.classList.remove('selected'));
    }
}

function updateCountUI() {
    document.getElementById('enh-sel-count').textContent = selectedImages.size;
}

// 서버에 이미지 삭제 요청 (일괄 삭제)
async function deleteSelectedImages() {
    if (selectedImages.size === 0) return;

    if (!confirm(`정말 ${selectedImages.size}개의 이미지를 영구 삭제하시겠습니까?`)) return;

    let deletedCount = 0;

    // 선택된 이미지들을 순회하며 서버에 삭제 요청 (Promise.all을 사용해 병렬 처리)
    const deletePromises = Array.from(selectedImages).map(async (src) => {
        try {
            // ST의 파일 삭제 API 호출 (경로나 방식은 ST 버전에 따라 다를 수 있음)
            const res = await fetch('/api/images/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: src })
            });
            
            if (res.ok) {
                deletedCount++;
                // 화면에서 즉시 제거
                const el = document.querySelector(`.enh-gallery-item[data-src="${src}"]`);
                if (el) el.remove();
            }
        } catch (e) {
            console.error("삭제 실패:", src, e);
        }
    });

    await Promise.all(deletePromises);
    
    alert(`${deletedCount}개의 이미지가 삭제되었습니다.`);
    selectedImages.clear();
    updateCountUI();
}

// 초기화 함수
function init() {
    document.body.insertAdjacentHTML('beforeend', galleryHTML);

    // 확장 기능 메뉴에 버튼 추가
    const extMenu = document.getElementById('extensionsMenu') || document.getElementById('extensions_settings');
    if (extMenu) {
        const openBtn = document.createElement('div');
        openBtn.className = 'list-group-item flex-container flexGap5';
        openBtn.innerHTML = `<span>🖼️ 갤러리 전체보기</span>`;
        openBtn.style.cursor = 'pointer';
        openBtn.addEventListener('click', () => {
            document.getElementById('enh-gallery-modal').style.display = 'flex';
            fetchAllImages(); // 열 때마다 최신 서버 이미지 로드
        });
        extMenu.appendChild(openBtn);
    }

    // 닫기 버튼
    document.getElementById('enh-btn-close').addEventListener('click', () => {
        document.getElementById('enh-gallery-modal').style.display = 'none';
        isSelectMode = false;
        updateModeUI();
    });

    // 라이트박스 닫기 (배경 클릭)
    document.getElementById('enh-lightbox').addEventListener('click', (e) => {
        if (e.target.id === 'enh-lightbox') {
            document.getElementById('enh-lightbox').style.display = 'none';
        }
    });

    // 버튼 이벤트 리스너 등록
    document.getElementById('enh-btn-toggle-mode').addEventListener('click', () => {
        isSelectMode = !isSelectMode;
        updateModeUI();
    });

    document.getElementById('enh-btn-select-all').addEventListener('click', () => {
        const items = document.querySelectorAll('.enh-gallery-item');
        if (selectedImages.size === items.length) {
            selectedImages.clear();
            items.forEach(item => item.classList.remove('selected'));
        } else {
            items.forEach(item => {
                selectedImages.add(item.dataset.src);
                item.classList.add('selected');
            });
        }
        updateCountUI();
    });

    document.getElementById('enh-btn-delete').addEventListener('click', deleteSelectedImages);
}

// 스크립트 로드 시 초기화
jQuery(document).ready(init);
