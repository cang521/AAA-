export const CLOUD_MILK_DESKTOP_WALLPAPER = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2000" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#E2F3FF"/>
      <stop offset="35%" stop-color="#F5FBFF"/>
      <stop offset="70%" stop-color="#EBF6FF"/>
      <stop offset="100%" stop-color="#D4ECFC"/>
    </linearGradient>
    <linearGradient id="cloud1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#E1F2FE" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="cloud2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#D8EEFC" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
    </filter>
  </defs>

  <rect width="1000" height="2000" fill="url(#bg)"/>

  <circle cx="500" cy="220" r="280" fill="#FFFFFF" opacity="0.65" filter="url(#softGlow)"/>
  <circle cx="500" cy="220" r="160" fill="#EBF7FF" opacity="0.75"/>

  <path d="M 120,280 Q 180,190 270,210 Q 350,170 430,210 Q 510,150 590,200 Q 670,160 740,210 Q 830,190 890,260 Q 960,290 930,370 L 80,370 Z" fill="url(#cloud1)"/>
  
  <path d="M 220,120 L 226,134 L 240,140 L 226,146 L 220,160 L 214,146 L 200,140 L 214,134 Z" fill="#8DCCF4" opacity="0.85"/>
  <path d="M 780,100 L 784,110 L 794,114 L 784,118 L 780,128 L 776,118 L 766,114 L 776,110 Z" fill="#8DCCF4" opacity="0.75"/>
  <circle cx="340" cy="110" r="6" fill="#BCE3FD" opacity="0.9"/>
  <circle cx="680" cy="140" r="8" fill="#FFFFFF" opacity="0.95"/>

  <rect x="0" y="370" width="1000" height="1250" fill="#F5FBFF" opacity="0.1"/>

  <path d="M -50,1780 Q 150,1660 380,1720 Q 600,1620 820,1700 Q 980,1640 1050,1750 L 1050,2050 L -50,2050 Z" fill="url(#cloud2)"/>
  <path d="M -50,1860 Q 250,1780 500,1830 Q 750,1760 1050,1850 L 1050,2050 L -50,2050 Z" fill="#FFFFFF" opacity="0.95"/>
</svg>
`)}`;

export const CLOUD_MILK_LOCK_WALLPAPER = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2000" width="100%" height="100%">
  <defs>
    <linearGradient id="lockBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#D6EEFC"/>
      <stop offset="40%" stop-color="#EFF8FF"/>
      <stop offset="75%" stop-color="#E2F3FF"/>
      <stop offset="100%" stop-color="#CBE6FA"/>
    </linearGradient>
    <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#D9EFFE" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="moonGlow">
      <feGaussianBlur stdDeviation="22" result="blur"/>
    </filter>
  </defs>

  <rect width="1000" height="2000" fill="url(#lockBg)"/>

  <circle cx="500" cy="380" r="220" fill="#FFFFFF" opacity="0.8" filter="url(#moonGlow)"/>

  <path d="M 500,240 A 130,130 0 1,0 630,370 A 110,110 0 1,1 500,240 Z" fill="#8DCCF4" opacity="0.9"/>

  <path d="M 300,220 L 308,236 L 324,244 L 308,252 L 300,268 L 292,252 L 276,244 L 292,236 Z" fill="#FFFFFF"/>
  <path d="M 720,280 L 726,292 L 738,298 L 726,304 L 720,316 L 714,304 L 702,298 L 714,292 Z" fill="#67B7EA"/>
  <path d="M 220,420 L 225,431 L 236,436 L 225,441 L 220,452 L 215,441 L 204,436 L 215,431 Z" fill="#8DCCF4"/>
  <path d="M 780,480 L 784,490 L 794,494 L 784,498 L 780,508 L 776,498 L 766,494 L 776,490 Z" fill="#FFFFFF"/>
  <circle cx="400" cy="180" r="7" fill="#FFFFFF"/>
  <circle cx="620" cy="190" r="9" fill="#BCE3FD"/>

  <path d="M 100,550 Q 180,460 280,490 Q 380,420 480,470 Q 580,410 680,470 Q 780,440 860,510 Q 940,480 980,560 L 980,680 L 20,680 Z" fill="url(#cloudGrad)"/>

  <path d="M -50,1720 Q 200,1600 450,1660 Q 700,1580 1050,1680 L 1050,2050 L -50,2050 Z" fill="url(#cloudGrad)"/>
  <path d="M -50,1820 Q 250,1740 550,1800 Q 800,1720 1050,1820 L 1050,2050 L -50,2050 Z" fill="#FFFFFF"/>
</svg>
`)}`;
