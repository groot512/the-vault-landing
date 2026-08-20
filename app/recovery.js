(() => {
  const prefixes = [
    'amber', 'arctic', 'azure', 'brass', 'calm', 'cedar', 'clear', 'coral',
    'dawn', 'deep', 'ember', 'fern', 'gold', 'harbor', 'hidden', 'indigo',
    'ivory', 'jade', 'lunar', 'maple', 'mist', 'navy', 'olive', 'quiet',
    'river', 'silver', 'solar', 'still', 'stone', 'velvet', 'winter', 'young',
  ];
  const nouns = [
    'anchor', 'arch', 'atlas', 'beacon', 'birch', 'bridge', 'canyon', 'cipher',
    'circle', 'cloud', 'comet', 'compass', 'copper', 'cove', 'crystal', 'delta',
    'ember', 'field', 'flame', 'forest', 'frame', 'gate', 'grove', 'harbor',
    'haven', 'island', 'key', 'lake', 'lantern', 'leaf', 'meadow', 'moon',
    'north', 'oak', 'orbit', 'path', 'peak', 'pine', 'quartz', 'rain',
    'reef', 'ridge', 'river', 'sail', 'signal', 'sky', 'spring', 'star',
    'stone', 'summit', 'tide', 'tower', 'trail', 'valley', 'vault', 'wave',
    'willow', 'wind', 'wing', 'wood', 'zenith', 'zero', 'zone', 'echo',
  ];

  const bytesToBits = (bytes) => [...bytes]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');

  const generatePhrase = async () => {
    const entropy = window.crypto.getRandomValues(new Uint8Array(16));
    const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', entropy));
    const bits = `${bytesToBits(entropy)}${bytesToBits(digest).slice(0, 4)}`;
    const words = [];
    for (let offset = 0; offset < 132; offset += 11) {
      const index = Number.parseInt(bits.slice(offset, offset + 11), 2);
      words.push(`${prefixes[index >> 6]}-${nouns[index & 63]}`);
    }
    return words;
  };

  const verifier = async (words) => {
    const normalized = words.join(' ').normalize('NFKC').toLowerCase();
    const digest = new Uint8Array(await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`THE-VAULT-RECOVERY-V1:${normalized}`),
    ));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  window.vaultRecovery = Object.freeze({ generatePhrase, verifier });
})();
