"use strict";

const TravelExpenses = (() => {
  const DAY = 86_400_000;
  const DAILY_RATE = 25_000;
  const FIRST_SUPPORTED_DATE = "2025-12-30";
  const MERGER_DATE = "2026-07-01";

  function tripDays(start, end) {
    if (!start || !end) return 0;
    return Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  }

  function nightlyCap(grade, region, start) {
    if (grade !== "2") return Infinity;
    if (region === "seoul") return 100_000;
    if (region === "metro" || (region === "gwangju" && start >= MERGER_DATE)) return 80_000;
    if (region === "other" || (region === "jeonnam" && start >= MERGER_DATE)) return 70_000;
    throw new Error("숙박 지역을 선택하세요.");
  }

  function localExpenses(trip) {
    const base = trip.duration === "long" ? 20_000 : 10_000;
    const limit = trip.localVehicle === "official" ? base - 10_000 : base;

    if (trip.localVehicle === "assigned") {
      return [["근무지 내 여비", 0, "전용차량 배정자 지급 제외"]];
    }
    if (trip.shortDistance) {
      return [["근거리 출장 실비", Math.min(trip.localExpense, base), "왕복 2km 이내 · 인정 실비와 적용 한도 중 낮은 금액"]];
    }
    const duration = trip.duration === "long" ? "4시간 이상" : "4시간 미만";
    const note = trip.localVehicle === "official" ? duration + " · 차량 이용 등 10,000원 감액" : duration;
    return [["근무지 내 여비", limit, note]];
  }

  function discountedDays(stayDays) {
    const days16to30 = Math.max(0, Math.min(stayDays, 30) - 15);
    const days31to60 = Math.max(0, Math.min(stayDays, 60) - 30);
    const after60 = Math.max(0, stayDays - 60);
    return days16to30 / 10 + days31to60 / 5 + after60 * 3 / 10;
  }

  function lodgingExpenses(trip, days) {
    const totalNights = trip.stays.reduce((total, stay) => total + stay.nights, 0);
    if (totalNights > days - 1) {
      throw new Error("입력한 숙박 박수가 출장 기간에 가능한 박수보다 많습니다.");
    }

    let lodgingTotal = 0;
    let capTotal = 0;
    for (const stay of trip.stays) {
      capTotal += nightlyCap(trip.grade, stay.region, trip.start) * stay.nights;
      lodgingTotal += stay.nightly * stay.nights;
    }
    const lodging = Math.min(lodgingTotal, capTotal);
    const excess = lodgingTotal - lodging;
    const extraLodging = trip.approvedOverage ? Math.min(excess, capTotal * 0.3) : 0;
    return { totalNights, lodging, extraLodging, excludedLodging: excess - extraLodging };
  }

  function outsideExpenses(trip, days) {
    const noFare = trip.transport === "official" || trip.transport === "none";
    const actual = trip.grade === "actual";
    const halfDays = trip.transport === "official" ? days : trip.halfDays;
    const mealDays = trip.mealDays ?? days;
    if (halfDays > days || mealDays > days) {
      throw new Error("일비 감액 일수와 식비 지급 일수는 출장일수 이내여야 합니다.");
    }
    const stayDiscount = actual ? 0 : discountedDays(trip.stayDays);
    if (stayDiscount > 0 && halfDays > 0 && halfDays < days) {
      throw new Error("장기체재와 일부 일자의 일비 감액이 겹칩니다. 겹치는 일자의 지급 기준을 기관에서 확인하세요.");
    }
    const payableDays = days - halfDays / 2 - stayDiscount * (halfDays === days ? 0.5 : 1);
    const mileageBase = Math.min(trip.mileageSaving / 2, days * DAILY_RATE / 2);
    const mileage = actual ? 0 : Math.floor(mileageBase * payableDays / days);
    const daily = actual ? trip.actualDaily : Math.round(payableDays * DAILY_RATE);
    const meals = actual ? trip.actualMeals : mealDays * DAILY_RATE;
    const { totalNights, lodging, extraLodging, excludedLodging } = lodgingExpenses(trip, days);
    const dailyNotes = [actual ? "지급 대상 실비" : `${days}일 × 25,000원`];
    if (!actual && halfDays) dailyNotes.push(`${halfDays}일 절반 지급`);
    if (stayDiscount) dailyNotes.push("동일 지역 장기체재 감액");
    const rows = [
      ["운임", noFare ? 0 : trip.fare, noFare ? "지급 대상 운임 없음" : trip.fareBasis],
      ["일비", daily, dailyNotes.join(" · ")],
      ["숙박비", lodging, totalNights ? `실제 숙박 ${totalNights}박 · ${trip.grade === "2" ? "지역별 상한 합계 적용" : "실비"}` : "입력한 숙박 없음"],
      ["식비", meals, actual ? "지급 대상 실비" : `${mealDays}일 × 25,000원`],
    ];
    if (mileage) rows.push(["항공마일리지 추가 일비", mileage, "절약한 항공운임 한도 적용"]);
    if (extraLodging) rows.push(["추가 숙박비", extraLodging, "부득이한 초과분 · 상한의 30% 이내"]);
    return { rows, excludedLodging };
  }

  function calculate(trip) {
    const days = tripDays(trip.start, trip.end);
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new Error("복귀일은 출발일과 같거나 이후여야 합니다.");
    }
    if (trip.start < FIRST_SUPPORTED_DATE) {
      throw new Error("2025년 12월 30일 이후 출발한 출장의 기준을 제공합니다.");
    }
    const result = trip.type === "local" ? { rows: localExpenses(trip), excludedLodging: 0 } : outsideExpenses(trip, days);
    const total = result.rows.reduce((sum, row) => sum + row[1], 0);
    return { ...result, days, total };
  }

  return { calculate, tripDays, nightlyCap, MERGER_DATE };
})();

if (typeof module !== "undefined") module.exports = TravelExpenses;
