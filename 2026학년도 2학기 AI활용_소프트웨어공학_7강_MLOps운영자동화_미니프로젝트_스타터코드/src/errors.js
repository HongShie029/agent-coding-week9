// 모든 업무 오류는 AppError 로 던진다. code 는 docs/API_CONTRACT.md 의 오류 코드표를 따른다.
class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

module.exports = { AppError };
