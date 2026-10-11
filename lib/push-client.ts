// Web and iOS remain usable while Android push is tested.
export async function pushEnabled(_owner: string): Promise<boolean> { return false; }
export async function enablePush(_owner: string): Promise<void> { throw new Error('Push is available in the Android preview.'); }
export async function disablePush(_owner: string): Promise<void> {}
export async function testPush(_owner: string): Promise<void> { throw new Error('Push is available in the Android preview.'); }
export async function refreshPush(_owner: string): Promise<void> {}
export async function revokePushBeforeSignOut(): Promise<void> {}
