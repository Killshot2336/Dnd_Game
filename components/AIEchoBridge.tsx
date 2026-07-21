'use client';

import { useEffect } from 'react';
import { bindAIEchoBridge } from '@/lib/ai-echo-bridge';

/**
 * Mounts the AI echo bridge when the main hub boots on the device window.
 * Renders nothing — diagnostic console telemetry only.
 */
export default function AIEchoBridge() {
  useEffect(() => {
    bindAIEchoBridge();
  }, []);

  return null;
}
