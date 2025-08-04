export enum SdkVersion {
  API10 = '4.0.0',
  API11 = '4.1.0',
  API12 = '5.0.0',
  API13 = '5.0.1',
  API14 = '5.0.2',
  API15 = '5.0.3',
  API18 = '5.1.0',
  API20 = '6.0.0-Beta1',
}

export enum SdkArch {
  X86,
  ARM,
}

export enum SdkOS {
  MacOS,
  Windows,
  Linux,
}

export type SdkUrlStorage = Record<SdkVersion, Record<SdkArch, Record<SdkOS, string | null>>>

const urls: SdkUrlStorage = {
  [SdkVersion.API10]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API11]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-mac-public-signed.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API12]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API13]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API14]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API15]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API18]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
  [SdkVersion.API20]: {
    [SdkArch.X86]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/6.0-Beta1/ohos-sdk-mac-public.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/6.0-Beta1/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: 'https://mirrors.huaweicloud.com/harmonyos/os/6.0-Beta1/ohos-sdk-windows_linux-public.tar.gz',
    },
    [SdkArch.ARM]: {
      [SdkOS.MacOS]: 'https://mirrors.huaweicloud.com/harmonyos/os/6.0-Beta1/L2-SDK-MAC-M1-PUBLIC.tar.gz',
      [SdkOS.Windows]: 'https://mirrors.huaweicloud.com/harmonyos/os/6.0-Beta1/ohos-sdk-windows_linux-public.tar.gz',
      [SdkOS.Linux]: null,
    },
  },
}

/**
 * Get the SDK URL for a given version, architecture, and operating system.
 * @param version - The version of the SDK.
 * @param arch - The architecture of the SDK.
 * @param os - The operating system of the SDK.
 * @returns The URL of the SDK.
 */
export function getSdkUrl(version: SdkVersion, arch: SdkArch, os: SdkOS): string | null {
  return urls?.[version]?.[arch]?.[os] ?? null
}

/**
 * Get all the SDK URLs.
 * @returns The SDK URLs.
 */
export function getSdkUrls(): SdkUrlStorage {
  return urls
}
