/**
 * 平台壳类型兼容入口。
 *
 * 契约真值已下沉到 shared：场景包单独开发时只依赖 @digital-twin/shared，
 * 不再反向依赖平台壳。此处保留导出名，避免既有引用发生行为变化。
 */
export type { DeviceDefinition, PlatformModeDef, PlatformModeState } from '@digital-twin/shared';
