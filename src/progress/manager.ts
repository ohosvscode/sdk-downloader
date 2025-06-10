import type { DownloadProgressEvent } from '../options'

/**
 * 统一的进度管理器，将下载和解压进度合并
 */
export class UnifiedProgressManager {
  private downloadWeight = 0.7 // 下载占总进度的 70%
  private extractWeight = 0.3 // 解压占总进度的 30%

  private downloadCompleted = false
  private lastDownloadProgress: any = null
  private lastPercentage = 0 // 追踪上一次的百分比

  private totalSize: number
  private initialStartByte: number
  private onProgressCallback?: (progress: DownloadProgressEvent) => void

  constructor(totalSize: number, initialStartByte: number = 0, onProgress?: (progress: DownloadProgressEvent) => void) {
    this.totalSize = totalSize
    this.initialStartByte = initialStartByte
    this.onProgressCallback = onProgress

    // 如果是断点续传，初始化 lastPercentage
    if (initialStartByte > 0 && totalSize > 0) {
      const initialOverallPercentage = (initialStartByte / totalSize) * 100
      this.lastPercentage = Math.round(initialOverallPercentage * this.downloadWeight * 100) / 100
    }
  }

  updateDownloadProgress(progressData: any): void {
    // 将下载进度映射到 0-70% 范围
    const scaledPercentage = (progressData.percentage || 0) * this.downloadWeight

    // 计算增量，保留两位小数
    const increment = Math.round((scaledPercentage - this.lastPercentage) * 100) / 100

    const scaledProgress: DownloadProgressEvent = {
      ...progressData,
      percentage: Math.round(scaledPercentage * 100) / 100,
      increment,
    }

    this.lastDownloadProgress = scaledProgress
    this.lastPercentage = Math.round(scaledPercentage * 100) / 100
    this.emitProgress(scaledProgress)
  }

  markDownloadComplete(): void {
    this.downloadCompleted = true
  }

  updateExtractProgress(current: number, total: number): void {
    if (!this.downloadCompleted) {
      this.downloadCompleted = true
    }

    // 解压进度从 70% 开始，增加到 100%
    const extractPercentage = total > 0 ? (current / total) * 100 : 0
    const totalPercentage = this.downloadWeight * 100 + (extractPercentage * this.extractWeight)
    const clampedPercentage = Math.min(totalPercentage, 100)

    // 计算增量，保留两位小数
    const increment = Math.round((clampedPercentage - this.lastPercentage) * 100) / 100

    // 基于最后的下载进度数据创建解压进度数据
    const baseProgress = this.lastDownloadProgress || {
      transferred: this.totalSize * this.downloadWeight,
      length: this.totalSize,
      remaining: this.totalSize * this.extractWeight,
      eta: 0,
      runtime: 0,
      delta: 0,
      speed: 0,
      network: 0,
      unit: 'KB' as const,
    }

    const extractProgress: DownloadProgressEvent = {
      ...baseProgress,
      percentage: Math.round(clampedPercentage * 100) / 100,
      increment,
      transferred: Math.floor((clampedPercentage / 100) * this.totalSize),
      remaining: Math.max(0, this.totalSize - Math.floor((clampedPercentage / 100) * this.totalSize)),
      eta: 0, // 解压阶段 ETA 较难预估
      speed: 0, // 解压阶段没有网络速度
      network: 0,
    }

    this.lastPercentage = Math.round(clampedPercentage * 100) / 100
    this.emitProgress(extractProgress)
  }

  private emitProgress(progressData: DownloadProgressEvent): void {
    this.onProgressCallback?.(progressData)
  }
}
