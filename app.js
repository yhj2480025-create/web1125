"use strict";

const form = document.querySelector("#trip-form");
const fields = form.elements;
const byId = (id) => document.getElementById(id);
const value = (name) => fields.namedItem(name).value;
const checked = (name) => fields.namedItem(name).checked;
const money = (amount) => new Intl.NumberFormat("ko-KR").format(amount) + "원";
const options = document.querySelector(".options");
const stayList = byId("lodging-list");
const initialBreakdown = byId("breakdown").innerHTML;
const downloadButton = byId("download-excel");
const downloadError = byId("download-error");
let exportData = null;

function show(id, visible) {
  const element = byId(id);
  element.hidden = !visible;
  if (element instanceof HTMLFieldSetElement) {
    element.disabled = !visible;
  } else {
    element.querySelectorAll("input, select").forEach((control) => {
      control.disabled = !visible;
    });
  }
}

function fareBasis(transport, grade) {
  switch (transport) {
    case "rail": return grade === "2" ? "철도 일반실 실비" : "철도 특실 기준 실비";
    case "ship": return grade === "2" ? "선박 2등급 기준 실비" : "선박 1등급 기준 실비";
    case "car": return checked("approvedCar") ? "인정된 연료비·통행료 등 실비" : "해당 철도 또는 버스 운임 기준";
    case "flight": return "좌석 등급 기준 및 마일리지 사용을 반영한 실비";
    case "mixed": return "지급 대상인 교통 구간의 운임 합계";
    default: return "해당 운임 기준 실비";
  }
}

function getDates() {
  const start = value("start");
  const end = value("end");
  return { start, end, days: TravelExpenses.tripDays(start, end) };
}

function updateConditions() {
  const { start, end, days } = getDates();
  const local = value("type") === "local";
  const grade = value("grade");
  const transport = value("transport");
  const flightOrShip = transport === "flight" || transport === "ship";
  const actual = grade === "actual";
  const noFare = transport === "official" || transport === "none";
  const nightsAllowed = days > 1 ? days - 1 : 0;
  fields.end.min = start || fields.start.min;

  show("local-fields", local);
  show("outside-fields", !local);
  show("local-expenses", local && checked("shortDistance") && value("localVehicle") !== "assigned");
  show("own-car", transport === "car");
  show("fare-field", !noFare);
  show("actual-fields", actual);
  show("lodging-fields", nightsAllowed > 0);
  show("water-lodging", flightOrShip);
  show("half-field", !actual && transport !== "official");
  show("meal-field", !actual);
  show("mileage-field", !actual && (transport === "flight" || transport === "mixed"));
  show("long-field", !actual && days > 17);
  byId("fare-hint").textContent = fareBasis(transport, grade) + " · 할인이 가능하면 할인 요금";
  fields.mealDays.required = flightOrShip && !actual;
  fields.mealDays.placeholder = flightOrShip ? "해당 없으면 0" : "전체 출장일수";
  byId("meal-hint").textContent = flightOrShip
    ? "항공·선박 이동 중에는 별도 식비가 필요한 일수만 입력하세요."
    : "별도 조정이 필요한 경우 입력하세요.";
  fields.halfDays.max = days > 0 ? days : "";
  fields.mealDays.max = days > 0 ? days : "";
  fields.stayDays.max = Math.max(0, days - 2);

  byId("period").textContent = start && end && days <= 0
    ? "복귀일을 출발일과 같거나 이후로 선택하세요."
    : days > 0
      ? (local ? `출장 기간 ${days}일 · 여비는 총 출장시간 기준` : `출장 기간 ${days}일 · 최대 ${nightsAllowed}박`)
      : "출발일과 복귀일을 선택하세요.";
  const stays = [...stayList.children];
  stays.forEach((row, index) => {
    const number = index + 1;
    row.querySelector(".stay-title").textContent = `숙박 ${number}`;
    row.querySelector(".remove").setAttribute("aria-label", `숙박 ${number} 삭제`);
    const region = row.querySelector("[name=region]");
    const capped = grade === "2";
    row.querySelector(".region-field").hidden = !capped;
    region.disabled = !capped;
    region.required = capped;
    for (const option of region.querySelectorAll('[value="gwangju"], [value="jeonnam"]')) {
      option.hidden = start < TravelExpenses.MERGER_DATE;
      option.disabled = option.hidden;
      if (option.selected && option.disabled) region.value = "";
    }
    row.querySelector("[name=nights]").max = nightsAllowed || "";
  });
  byId("add-stay").disabled = stays.length >= nightsAllowed;
}

function clearResult() {
  exportData = null;
  downloadButton.disabled = true;
  downloadError.hidden = true;
  byId("print-result").disabled = true;
  byId("total").textContent = "—";
  byId("result-period").textContent = "출장 정보를 입력하고 계산하세요.";
  byId("breakdown").innerHTML = initialBreakdown;
  byId("result-note").hidden = true;
  byId("error").hidden = true;
}

function readTrip() {
  const { start, end, days } = getDates();
  const transport = value("transport");
  const stays = days > 1 ? [...stayList.children].map((row) => ({
    region: row.querySelector("[name=region]").value,
    nights: Number(row.querySelector("[name=nights]").value),
    nightly: Number(row.querySelector("[name=nightly]").value),
  })) : [];
  return {
    start, end, stays, transport,
    type: value("type"),
    grade: value("grade"),
    duration: value("duration"),
    localVehicle: value("localVehicle"),
    shortDistance: checked("shortDistance"),
    localExpense: Number(value("localExpense")),
    fare: Number(value("fare")),
    fareBasis: fareBasis(transport, value("grade")),
    halfDays: fields.halfDays.disabled ? 0 : Number(value("halfDays")),
    mealDays: fields.mealDays.disabled || value("mealDays") === "" ? null : Number(value("mealDays")),
    mileageSaving: fields.mileageSaving.disabled ? 0 : Number(value("mileageSaving")),
    actualDaily: Number(value("actualDaily")),
    actualMeals: Number(value("actualMeals")),
    approvedOverage: checked("approvedOverage"),
    stayDays: fields.stayDays.disabled ? 0 : Number(value("stayDays")),
  };
}

function render(result, trip) {
  byId("total").textContent = money(result.total);
  byId("result-period").textContent = `${trip.start} ~ ${trip.end} · ${result.days}일`;
  byId("breakdown").replaceChildren(...result.rows.map(([label, amount, basis]) => {
    const row = document.createElement("div");
    const title = document.createElement("dt");
    const amountText = document.createElement("dd");
    const description = document.createElement("span");
    title.textContent = label;
    description.textContent = basis;
    title.append(description);
    amountText.textContent = money(amount);
    row.append(title, amountText);
    return row;
  }));
  const notes = [];
  if (result.excludedLodging) notes.push(`숙박비 중 ${money(result.excludedLodging)}은 지급 범위를 넘어 합계에서 제외했습니다.`);
  if (trip.type === "outside" && trip.grade !== "actual" && result.days > 17 && !trip.stayDays) {
    notes.push("일부 기간 같은 지역에 장기체재한 경우 해당 기간의 일비 감액을 별도로 확인하세요.");
  }
  byId("result-note").textContent = notes.join(" ");
  byId("result-note").hidden = !notes.length;
  exportData = { result, trip, notes };
  downloadButton.disabled = false;
  byId("print-result").disabled = false;
}

byId("print-result").addEventListener("click", () => window.print());

const criteriaDialog = byId("criteria-dialog");
byId("open-criteria").addEventListener("click", () => criteriaDialog.showModal());
byId("close-criteria").addEventListener("click", () => criteriaDialog.close());

downloadButton.addEventListener("click", async () => {
  const snapshot = exportData;
  if (!snapshot) return;
  const { result, trip, notes } = snapshot;
  downloadError.hidden = true;
  try {
    const rows = [
      { values: ["국내 출장여비 계산 결과", "", ""], heading: true },
      { values: ["출장 유형", trip.type === "local" ? "근무지 내" : "근무지 외"] },
      { values: ["출발일", trip.start] },
      { values: ["복귀일", trip.end] },
      { values: ["출장일수", result.days] },
      { values: ["예상 지급액 (원)", result.total], moneyColumn: true },
      { values: [] },
      { values: ["항목", "금액 (원)", "계산 근거"], heading: true },
      ...result.rows.map((values) => ({ values, moneyColumn: true })),
      ...notes.map((note) => ({ values: ["참고", "", note] })),
    ];
    const workbook = await makeExpenseWorkbook(rows);
    if (snapshot !== exportData) return;
    const url = URL.createObjectURL(workbook);
    const link = document.createElement("a");
    link.href = url;
    link.download = `출장여비_${trip.start}_${trip.end}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    if (snapshot === exportData) {
      downloadError.textContent = "엑셀 파일을 만들 수 없습니다. 다시 시도해 주세요.";
      downloadError.hidden = false;
    }
  }
});

form.addEventListener("input", (event) => {
  if (event.target === fields.start && value("start") && !value("end")) fields.end.value = value("start");
  if (event.target === fields.transport && ["flight", "ship"].includes(value("transport"))) options.open = true;
  updateConditions();
  clearResult();
});

byId("add-stay").addEventListener("click", () => {
  const entry = byId("stay-template").content.firstElementChild.cloneNode(true);
  stayList.append(entry);
  updateConditions();
  clearResult();
  entry.querySelector(value("grade") === "2" ? "select" : "[name=nightly]").focus();
});

stayList.addEventListener("click", (event) => {
  if (!event.target.matches(".remove")) return;
  event.target.closest(".stay").remove();
  updateConditions();
  clearResult();
  byId("add-stay").focus();
});

form.addEventListener("invalid", (event) => {
  const details = event.target.closest("details");
  if (details) details.open = true;
}, true);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearResult();
  try {
    const trip = readTrip();
    render(TravelExpenses.calculate(trip), trip);
  } catch (error) {
    byId("error").textContent = error.message;
    byId("error").hidden = false;
  }
});

form.addEventListener("reset", () => {
  stayList.replaceChildren();
  options.open = false;
  clearResult();
  queueMicrotask(updateConditions);
});

updateConditions();
