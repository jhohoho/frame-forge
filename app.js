const STORAGE_KEY = 'frameforge_api_key';

// --- API Key ---
const apiBadge = document.getElementById('apiBadge');
const apiDot = document.getElementById('apiDot');
const apiLabel = document.getElementById('apiLabel');
const modalOverlay = document.getElementById('modalOverlay');
const apiKeyInput = document.getElementById('apiKeyInput');
const modalCancel = document.getElementById('modalCancel');
const modalSave = document.getElementById('modalSave');

function getApiKey() { return sessionStorage.getItem(STORAGE_KEY) || ''; }

function updateApiBadge() {
  const key = getApiKey();
  if (key) {
    apiDot.classList.add('active');
    apiLabel.textContent = 'API 키 설정됨';
  } else {
    apiDot.classList.remove('active');
    apiLabel.textContent = 'API 키 설정';
  }
}

apiBadge.addEventListener('click', () => {
  apiKeyInput.value = getApiKey();
  modalOverlay.classList.add('open');
});

modalCancel.addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

modalSave.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key) sessionStorage.setItem(STORAGE_KEY, key);
  else sessionStorage.removeItem(STORAGE_KEY);
  modalOverlay.classList.remove('open');
  updateApiBadge();
});

document.getElementById('modalDelete').addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  apiKeyInput.value = '';
  modalOverlay.classList.remove('open');
  updateApiBadge();
});

updateApiBadge();

// --- File Upload ---
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const generateBtn = document.getElementById('generateBtn');

let images = []; // { file, dataUrl }

uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      images.push({ file, dataUrl: e.target.result });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  previewGrid.innerHTML = '';
  images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${img.dataUrl}" />
      <button class="remove-btn" data-i="${i}">✕</button>
    `;
    previewGrid.appendChild(item);
  });
  previewGrid.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      images.splice(Number(btn.dataset.i), 1);
      renderPreviews();
    });
  });
  generateBtn.disabled = images.length === 0;
  // reset file input so same file can be re-added
  fileInput.value = '';
}

// --- Generate ---
const resultsEl = document.getElementById('results');

generateBtn.addEventListener('click', async () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    modalOverlay.classList.add('open');
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = '분석 중...';
  resultsEl.innerHTML = '';

  const extraInput = document.getElementById('extraInput').value.trim();

  for (const img of images) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `<div class="loading"><div class="spinner"></div> 분석 중...</div>`;
    resultsEl.appendChild(card);

    try {
      const result = await analyzeImage(apiKey, img.dataUrl, img.file.type, extraInput);
      card.innerHTML = renderResult(img.dataUrl, result);
      card.querySelector('.copy-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(result.prompt);
        e.target.textContent = '복사됨 ✓';
        setTimeout(() => e.target.textContent = '프롬프트 복사', 1500);
      });
    } catch (err) {
      const waitSec = parseRetrySeconds(err.message);
      if (waitSec) {
        card.innerHTML = `<div class="error-msg">쿼터 초과 — 잠시 후 자동으로 재시도됩니다.</div>`;
        startCooldown(waitSec, async () => {
          card.innerHTML = `<div class="loading"><div class="spinner"></div> 재시도 중...</div>`;
          try {
            const result = await analyzeImage(apiKey, img.dataUrl, img.file.type, extraInput);
            card.innerHTML = renderResult(img.dataUrl, result);
            card.querySelector('.copy-btn').addEventListener('click', (e) => {
              navigator.clipboard.writeText(result.prompt);
              e.target.textContent = '복사됨 ✓';
              setTimeout(() => e.target.textContent = '프롬프트 복사', 1500);
            });
          } catch (e2) {
            card.innerHTML = `<div class="error-msg">오류: ${e2.message}</div>`;
          }
        });
      } else {
        card.innerHTML = `<div class="error-msg">오류: ${err.message}</div>`;
      }
    }
  }

  generateBtn.disabled = false;
  generateBtn.textContent = '프롬프트 생성하기';
});

function parseRetrySeconds(msg) {
  const match = msg.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : null;
}

function startCooldown(seconds, onDone) {
  generateBtn.disabled = true;
  let remaining = seconds;
  const tick = () => {
    generateBtn.textContent = `대기 중... ${remaining}초`;
    if (remaining <= 0) {
      generateBtn.textContent = '프롬프트 생성하기';
      generateBtn.disabled = images.length === 0;
      onDone();
      return;
    }
    remaining--;
    setTimeout(tick, 1000);
  };
  tick();
}

async function analyzeImage(apiKey, dataUrl, mimeType, extraInput = '') {
  const base64 = dataUrl.split(',')[1];

  const systemPrompt = `You are a video prompt engineer specializing in hyperrealistic macro cinematography and miniature world storytelling.

Analyze the uploaded image and return a JSON object with these exact fields:
{
  "scene": "Korean title of the scene (e.g. '치킨 버킷 적재 현장')",
  "hook": "Korean description of the single most cinematic hook moment — the brief, visually stunning action at the mid-point of the video (2-3 sentences)",
  "prompt": "Full English video generation prompt (6-8 sentences covering: visual reference, camera behavior, worker motions, anticipation build-up, main hook event, resolution, and style tags)"
}

Rules for the prompt field:
- Start with: 'Use the uploaded [subject] image as the exact visual reference and first frame.'
- Camera: locked angle, subtle cinematic drift only, no zoom or pan
- Workers: tiny, realistic construction/maintenance motions
- Build anticipation before the hook event
- Main hook: 3-second climax moment described precisely
- End with calm resolution
- Style tags: Hyperrealistic macro food cinematography, miniature construction world, [material] texture, warm/cool lighting as appropriate, 4K, shallow DOF

${extraInput ? `Additional user direction (must reflect this in the prompt): "${extraInput}"` : ''}

Return only valid JSON. No markdown, no explanation.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  // gemini-2.5-flash는 thinking part가 먼저 올 수 있으므로 JSON이 있는 part를 찾음
  const text = parts.find(p => p.text?.trim().startsWith('{'))?.text
    || parts[parts.length - 1]?.text || '';

  const cleaned = text.trim();
  // 1. 직접 파싱 시도
  try { return JSON.parse(cleaned); } catch {}
  // 2. 마크다운 코드 블록 제거 후 파싱
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch {} }
  // 3. { ... } 구간만 추출 후 파싱
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  throw new Error('응답 파싱 실패. 다시 시도해주세요.');
}

function renderResult(dataUrl, result) {
  return `
    <div class="result-header">
      <img class="result-thumb" src="${dataUrl}" />
      <div class="result-meta">
        <div class="scene-label">장면 분석</div>
        <div class="scene-title">${result.scene || ''}</div>
        <div class="hook-event">${result.hook || ''}</div>
      </div>
    </div>
    <div class="result-body">
      <div class="prompt-label">영상 프롬프트 (English)</div>
      <div class="prompt-text">${result.prompt || ''}</div>
      <button class="copy-btn">프롬프트 복사</button>
    </div>
  `;
}
