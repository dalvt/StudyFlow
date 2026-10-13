import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import {
  t,
  setLanguage,
  getLanguageSetting,
  getEffectiveLanguage,
  setObsidianLanguageResolver,
} from '../src/i18n/index.ts';

test('i18n dictionaries: both dictionaries have the exact same keys', () => {
  const enKeys = Object.keys(en).sort();
  const esKeys = Object.keys(es).sort();

  // Test that both arrays have the same size and identical keys
  assert.equal(
    esKeys.length,
    enKeys.length,
    `Key counts mismatch: es has ${esKeys.length}, en has ${enKeys.length}`
  );
  assert.deepEqual(esKeys, enKeys);
});

test('i18n dictionaries: all entries have non-empty strings', () => {
  for (const [k, v] of Object.entries(en)) {
    assert.equal(typeof v, 'string', `en[${k}] is not a string`);
    assert.ok(v.trim().length > 0, `en[${k}] is empty`);
  }
  for (const [k, v] of Object.entries(es)) {
    assert.equal(typeof v, 'string', `es[${k}] is not a string`);
    assert.ok(v.trim().length > 0, `es[${k}] is empty`);
  }
});

test('i18n Spanish dictionary is unified in neutral tuteo without voseo', () => {
  const voseoRegex = /\b(Ingresá|Presioná|Diferenciá|Asigná|Marcá|Probá|Limpiá|Añadí|Tenés|Necesitás|Querés|Organizá|Visualizá|Configurá|Guardá|Completá|Creá|Seleccioná|Empezá|Recordá|Tomá)\b/i;

  const violations = [];
  for (const [key, value] of Object.entries(es)) {
    if (voseoRegex.test(value)) {
      violations.push({ key, value });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found voseo in Spanish dictionary: ${JSON.stringify(violations)}`
  );
});

test('t(key, params) accurately translates and interpolates parameters', () => {
  // Test Spanish
  setLanguage('es');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.save'), 'Guardar');
  assert.equal(
    t('settings.syncHistoryNotice', { count: 12 }),
    'Se sincronizaron 12 sesiones históricas desde tus notas.'
  );
  assert.equal(
    t('pomodoro.timesConfiguredNotice', { work: 25, break: 5 }),
    '✓ Tiempos configurados: 25m foco / 5m descanso'
  );

  // Test English
  setLanguage('en');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.save'), 'Save');
  assert.equal(
    t('settings.syncHistoryNotice', { count: 12 }),
    'Synchronized 12 historical sessions from your notes.'
  );
  assert.equal(
    t('pomodoro.timesConfiguredNotice', { work: 25, break: 5 }),
    '✓ Times configured: 25m focus / 5m break'
  );
});

test('language setting handles auto mode with Obsidian language resolver', () => {
  setLanguage('auto');
  assert.equal(getLanguageSetting(), 'auto');

  // When resolver returns 'en'
  setObsidianLanguageResolver(() => 'en');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.cancel'), 'Cancel');

  // When resolver returns 'es'
  setObsidianLanguageResolver(() => 'es');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.cancel'), 'Cancelar');

  // When resolver returns regional Spanish 'es-ES' or 'es-419'
  setObsidianLanguageResolver(() => 'es-419');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.cancel'), 'Cancelar');

  // When resolver returns an unsupported language e.g. 'fr' or 'de' -> falls back to 'en'
  setObsidianLanguageResolver(() => 'fr');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.cancel'), 'Cancel');

  // Reset resolver and set back to auto
  setObsidianLanguageResolver(null);
});
