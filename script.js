// ------------------------------
// 데이터/DOM 영역
// ------------------------------

// 단일 행 고정 샘플 데이터
const sampleRow = {
  replacementCumulative: 0,
  incomingAmount: 0,
  currentCumulative: 0,
  hourlyUsage: 0,
};

const inputBody = document.getElementById("inputBody");
const resultBody = document.getElementById("resultBody");
const errorBox = document.getElementById("errorBox");
const summaryNow = document.getElementById("summaryNow");
const calculateBtn = document.getElementById("calculateBtn");

// ------------------------------
// 유틸 함수
// ------------------------------

// 콤마 제거 후 숫자 파싱
function parseNumber(value) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (raw === "") return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

// 소수점 자릿수 확인
function getDecimalPlaces(value) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw.includes(".")) return 0;
  return raw.split(".")[1].length;
}

// 고정 소수점 콤마 포맷
function formatFixedNumber(value, fractionDigits = 2) {
  return Number(value).toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

// ton 형식 문자열 (예: 1.00ton)
function formatTon(value) {
  return `${formatFixedNumber(value, 2)}ton`;
}

// yyyy-mm-dd hh:mm 형식
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 소수 시간 -> X시간 Y분
function formatHoursToHourMin(hoursFloat) {
  const totalMinutes = Math.max(0, Math.round(hoursFloat * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}시간 ${m}분`;
}

// HTML 이스케이프
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// 입력/수집 함수
// ------------------------------

// 단일 입력 행 생성
function appendInputRow(data) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td data-label="원부재료명"><input class="input-cell" type="text" value="원부재료" readonly /></td>
    <td data-label="교체시점 누적사용량 (ton)"><input class="input-cell number-input" type="text" data-field="replacementCumulative" value="${formatFixedNumber(data.replacementCumulative, 2)}" placeholder="ton" /></td>
    <td data-label="입고량 (ton)"><input class="input-cell number-input" type="text" data-field="incomingAmount" value="${formatFixedNumber(data.incomingAmount, 2)}" placeholder="ton" /></td>
    <td data-label="현재 누적사용량 (ton)"><input class="input-cell number-input" type="text" data-field="currentCumulative" value="${formatFixedNumber(data.currentCumulative, 2)}" placeholder="ton" /></td>
    <td data-label="현재 시간당 사용량 (kg/h)"><input class="input-cell number-input kg-input" type="text" data-field="hourlyUsage" value="${formatFixedNumber(data.hourlyUsage, 1)}" placeholder="kg/h" /></td>
  `;
  inputBody.appendChild(tr);

  // kg/h 입력은 소수 1자리까지만 허용
  tr.querySelectorAll(".kg-input").forEach((input) => {
    input.dataset.prevValue = input.value;
    input.addEventListener("input", () => {
      const normalized = input.value.replace(/,/g, "").trim();
      const validPattern = /^\d*(\.\d{0,1})?$/;

      if (normalized === "" || validPattern.test(normalized)) {
        input.dataset.prevValue = input.value;
      } else {
        input.value = input.dataset.prevValue ?? "";
      }
    });
  });

  // 숫자 입력 blur 시 2자리 소수 포맷
  tr.querySelectorAll(".number-input").forEach((input) => {
    // 클릭/탭으로 포커스 시 기존 값 전체 선택 -> 바로 덮어쓰기 가능
    input.addEventListener("focus", () => {
      input.select();
    });

    input.addEventListener("blur", () => {
      const parsed = parseNumber(input.value);
      if (!Number.isNaN(parsed)) {
        if (input.classList.contains("kg-input")) {
          input.value = formatFixedNumber(parsed, 1);
        } else {
          input.value = formatFixedNumber(parsed, 2);
        }
      }
    });
  });
}

// 단일 행 입력값 수집
function collectInputRow() {
  const tr = inputBody.querySelector("tr");
  const getValue = (field) => tr.querySelector(`[data-field="${field}"]`)?.value ?? "";

  return {
    name: "원부재료",
    replacementCumulativeRaw: getValue("replacementCumulative"),
    incomingAmountRaw: getValue("incomingAmount"),
    currentCumulativeRaw: getValue("currentCumulative"),
    hourlyUsageRaw: getValue("hourlyUsage"),
    replacementCumulative: parseNumber(getValue("replacementCumulative")),
    incomingAmount: parseNumber(getValue("incomingAmount")),
    currentCumulative: parseNumber(getValue("currentCumulative")),
    hourlyUsage: parseNumber(getValue("hourlyUsage")),
  };
}

// ------------------------------
// 계산/검증 함수
// ------------------------------

// 입력 검증 및 계산 수행
function validateAndCalculate(row) {
  const now = new Date();
  const errors = [];

  if ([row.replacementCumulative, row.incomingAmount, row.currentCumulative, row.hourlyUsage].some(Number.isNaN)) {
    errors.push("숫자가 아닌 값이 포함되어 있습니다.");
  }

  if (!Number.isNaN(row.hourlyUsage) && row.hourlyUsage <= 0) {
    errors.push("현재 시간당 사용량(kg/h)은 0보다 커야 합니다.");
  }

  if (getDecimalPlaces(row.hourlyUsageRaw) > 1) {
    errors.push("현재 시간당 사용량(kg/h)은 소수점 1자리까지만 입력 가능합니다.");
  }

  // 남은 재고량 계산: ton
  const remainingStockTon = row.replacementCumulative + row.incomingAmount - row.currentCumulative;

  if (!Number.isNaN(remainingStockTon) && remainingStockTon <= 0) {
    errors.push("남은 재고량(ton)이 0 이하입니다. 입력값을 확인해주세요.");
  }

  if (errors.length) {
    return { now, errors, result: null };
  }

  // 시간당 사용량은 kg/h 이므로 ton -> kg 변환
  const remainingStockKg = remainingStockTon * 1000;
  const remainingHours = remainingStockKg / row.hourlyUsage;
  const predictedTime = new Date(now.getTime() + remainingHours * 60 * 60 * 1000);

  return {
    now,
    errors: [],
    result: {
      name: row.name,
      remainingStockTon,
      remainingHours,
      now,
      predictedTime,
    },
  };
}

// ------------------------------
// 렌더링 함수
// ------------------------------

// 오류 표시
function renderErrors(errors) {
  if (!errors.length) {
    errorBox.style.display = "none";
    errorBox.innerHTML = "";
    return;
  }

  errorBox.style.display = "block";
  errorBox.innerHTML = `
    <strong>입력값 오류가 있습니다.</strong>
    <ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
  `;
}

// 결과 테이블 표시
function renderResult(result) {
  if (!result) {
    resultBody.innerHTML = `
      <tr>
        <td colspan="5" class="muted">유효한 계산 결과가 없습니다. 입력값을 확인해주세요.</td>
      </tr>
    `;
    return;
  }

  const decimalHours = `${formatFixedNumber(result.remainingHours, 2)}h`;
  const hourMin = formatHoursToHourMin(result.remainingHours);

  resultBody.innerHTML = `
    <tr>
      <td data-label="원부재료명">${escapeHtml(result.name)}</td>
      <td data-label="남은 재고량 (ton)">${formatTon(result.remainingStockTon)}</td>
      <td data-label="남은 시간 (h / 시간·분)">${decimalHours} (${hourMin})</td>
      <td data-label="현재 시간">${formatDateTime(result.now)}</td>
      <td data-label="교체 예상 시간">${formatDateTime(result.predictedTime)}</td>
    </tr>
  `;
}

// 상단 현재 시간 표시
function renderSummaryNow(now) {
  summaryNow.textContent = formatDateTime(now);
}

// ------------------------------
// 실행 함수
// ------------------------------

function handleCalculate() {
  const input = collectInputRow();
  const { now, errors, result } = validateAndCalculate(input);
  renderErrors(errors);
  renderResult(result);
  renderSummaryNow(now);
}

function initialize() {
  appendInputRow(sampleRow);
  calculateBtn.addEventListener("click", handleCalculate);

  // 현재 시간은 1분 주기로 갱신
  setInterval(() => {
    renderSummaryNow(new Date());
  }, 60 * 1000);

  renderSummaryNow(new Date());
}

initialize();
