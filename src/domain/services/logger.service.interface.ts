export interface ILogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export const loggerSilencioso: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
