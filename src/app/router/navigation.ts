type NavigatorFn = (to: string) => void;

let appNavigator: NavigatorFn | null = null;

export function setAppNavigator(fn: NavigatorFn) {
  appNavigator = fn;
}

export function navigateToAppRoute(to: string) {
  if (appNavigator) {
    appNavigator(to);
  }
}
