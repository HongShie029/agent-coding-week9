// 실습용 상품 데이터 (수업용 가상 데이터)
function defaultProducts() {
  return [
    { id: "P1", name: "무선 마우스", price: 15000, stock: 10, status: "ON_SALE" },
    { id: "P2", name: "기계식 키보드", price: 59000, stock: 3, status: "ON_SALE" },
    { id: "P3", name: "USB-C 케이블", price: 9000, stock: 0, status: "ON_SALE" }, // 품절
    { id: "P4", name: "구형 헤드셋", price: 30000, stock: 5, status: "STOPPED" }, // 판매 중지
    { id: "P5", name: "모니터 받침대", price: 25000, stock: 1, status: "ON_SALE" }, // 마지막 1개
  ];
}

module.exports = { defaultProducts };
