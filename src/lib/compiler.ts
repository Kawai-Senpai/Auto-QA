import type { Assertion, Scenario, Step, Target } from './scenario.js';

function quote(value: string): string {
  return JSON.stringify(value);
}

/**
 * The root a target resolves against: the page, or a landmark scoping it.
 * Scoping is how repeated link text in a header and footer stays unambiguous
 * without falling back to positional selectors.
 */
function scope(target: Target): string {
  if (!target.within) {
    return 'page';
  }

  const options = target.within.name
    ? `, { name: ${quote(target.within.name)} }`
    : '';

  return `page.getByRole(${quote(target.within.role)}${options})`;
}

function locator(target: Target): string {
  const root = scope(target);

  switch (target.by) {
    case 'role': {
      const options = [
        `name: ${quote(target.name)}`,
        target.exact ? 'exact: true' : undefined,
      ]
        .filter(Boolean)
        .join(', ');

      return `${root}.getByRole(${quote(target.role)}, { ${options} })`;
    }

    case 'label': {
      const options = target.exact ? ', { exact: true }' : '';
      return `${root}.getByLabel(${quote(target.label)}${options})`;
    }

    case 'text': {
      const options = target.exact ? ', { exact: true }' : '';
      return `${root}.getByText(${quote(target.text)}${options})`;
    }

    case 'testId':
      return `${root}.getByTestId(${quote(target.testId)})`;
  }
}

function compileStep(step: Step): string[] {
  switch (step.action) {
    case 'goto':
      return [`  await page.goto(${quote(step.path)});`];
    case 'click':
      return [`  await ${locator(step.target)}.click();`];
    case 'fill':
      return [`  await ${locator(step.target)}.fill(${quote(step.value)});`];
    case 'press':
      return [`  await ${locator(step.target)}.press(${quote(step.key)});`];
    case 'check':
      return [`  await ${locator(step.target)}.check();`];
    case 'uncheck':
      return [`  await ${locator(step.target)}.uncheck();`];
    case 'hover':
      return [`  await ${locator(step.target)}.hover();`];
    case 'select':
      return [
        `  await ${locator(step.target)}.selectOption(${quote(step.value)});`,
      ];
    case 'keyboard':
      return [`  await page.keyboard.press(${quote(step.key)});`];
    case 'advanceClock':
      // Virtual time. The alternative is a real sleep, which the auditor
      // rejects and which would make expiry tests take as long as the expiry.
      return [`  await page.clock.fastForward(${quote(step.duration)});`];
    case 'setViewport':
      return [
        `  await page.setViewportSize({ width: ${step.width}, height: ${step.height} });`,
      ];
  }
}

function compileAssertion(assertion: Assertion, index: number): string[] {
  switch (assertion.type) {
    case 'visible':
      return [`  await expect(${locator(assertion.target)}).toBeVisible();`];
    case 'hidden':
      return [`  await expect(${locator(assertion.target)}).toBeHidden();`];
    case 'containsText':
      return [
        `  await expect(${locator(assertion.target)}).toContainText(${quote(assertion.text)});`,
      ];
    case 'value':
      return [
        `  await expect(${locator(assertion.target)}).toHaveValue(${quote(assertion.value)});`,
      ];
    case 'checked':
      return [`  await expect(${locator(assertion.target)}).toBeChecked();`];
    case 'unchecked':
      return [
        `  await expect(${locator(assertion.target)}).not.toBeChecked();`,
      ];
    case 'count':
      return [
        `  await expect(${locator(assertion.target)}).toHaveCount(${assertion.count});`,
      ];

    case 'urlPath':
      // expect.poll rather than a bare read, so a navigation that is still in
      // flight retries instead of failing on a race.
      return [
        '  await expect',
        '    .poll(() => new URL(page.url()).pathname)',
        `    .toBe(${quote(assertion.path)});`,
      ];

    case 'requestSeen':
      return [
        '  await expect',
        '    .poll(() =>',
        '      observedRequests.filter(request =>',
        `        request.method === ${quote(assertion.method)} &&`,
        `        request.url.includes(${quote(assertion.urlIncludes)}),`,
        '      ).length,',
        '    )',
        '    .toBeGreaterThan(0);',
      ];

    case 'requestAbsent':
      // Synchronous on purpose: the claim is that nothing was sent during the
      // scenario, so polling for an absence would only add latency.
      return [
        '  expect(',
        '    observedRequests.filter(request =>',
        `      request.method === ${quote(assertion.method)} &&`,
        `      request.url.includes(${quote(assertion.urlIncludes)}),`,
        '    ),',
        '  ).toHaveLength(0);',
      ];

    case 'axe': {
      const variableName = `accessibilityScanResults${index}`;
      const builder = assertion.tags?.length
        ? `new AxeBuilder({ page }).withTags(${JSON.stringify(assertion.tags)})`
        : 'new AxeBuilder({ page })';

      return [
        `  const ${variableName} = await ${builder}.analyze();`,
        '',
        `  expect(${variableName}.violations).toEqual([]);`,
      ];
    }

    case 'screenshot': {
      const options = [
        `      fullPage: ${assertion.fullPage}`,
        `      animations: 'disabled'`,
        `      caret: 'hide'`,
      ];

      if (assertion.maxDiffPixelRatio !== undefined) {
        options.push(`      maxDiffPixelRatio: ${assertion.maxDiffPixelRatio}`);
      }

      if (assertion.mask.length > 0) {
        // Masked regions are painted over before comparison, so clocks, avatars
        // and randomised content cannot fail an otherwise stable baseline.
        const masks = assertion.mask
          .map((target) => `        ${locator(target)}`)
          .join(',\n');
        options.push(`      mask: [\n${masks},\n      ]`);
      }

      return [
        `  await expect(page).toHaveScreenshot(${quote(assertion.name)}, {`,
        ...options.map((line) => `${line},`),
        '  });',
      ];
    }

    case 'ariaSnapshot': {
      const root = assertion.target ? locator(assertion.target) : 'page';
      return [
        `  await expect(${root}).toMatchAriaSnapshot(\``,
        ...assertion.snapshot.split('\n').map((line) => `    ${line}`),
        '  `);',
      ];
    }

    case 'attached':
      return [`  await expect(${locator(assertion.target)}).toBeAttached();`];
    case 'detached':
      return [
        `  await expect(${locator(assertion.target)}).not.toBeAttached();`,
      ];
    case 'enabled':
      return [`  await expect(${locator(assertion.target)}).toBeEnabled();`];
    case 'disabled':
      return [`  await expect(${locator(assertion.target)}).toBeDisabled();`];
    case 'focused':
      return [`  await expect(${locator(assertion.target)}).toBeFocused();`];
  }
}

export function compileScenario(scenario: Scenario): string {
  const needsAxe = scenario.assertions.some(
    (assertion) => assertion.type === 'axe',
  );

  const needsNetwork = scenario.assertions.some(
    (assertion) =>
      assertion.type === 'requestSeen' || assertion.type === 'requestAbsent',
  );

  const lines: string[] = [
    `// Generated from requirement: ${scenario.requirementSource}`,
    '// Do not weaken assertions merely to make this test pass.',
    '',
    "import { test, expect } from '../fixtures.js';",
  ];

  if (needsAxe) {
    lines.push("import AxeBuilder from '@axe-core/playwright';");
  }

  lines.push('');

  if (scenario.role) {
    // Storage state rather than logging in through the UI: faster, and it stops
    // one login-form change from breaking every authenticated test.
    lines.push(
      `test.use({ storageState: ${quote(
        `.qa/runtime/auth/${scenario.role}.json`,
      )} });`,
      '',
    );
  }

  lines.push(`test(${quote(scenario.name)}, async ({ page${
    scenario.har ? ', context' : ''
  } }) => {`);

  if (scenario.har) {
    lines.push(
      `  await context.routeFromHAR(${quote(scenario.har.path)}, {`,
      `    url: ${quote(scenario.har.urlPattern)},`,
      `    notFound: ${quote(scenario.har.notFound)},`,
      '  });',
      '',
    );
  }

  if (scenario.clockStart) {
    lines.push(
      `  await page.clock.install({ time: new Date(${quote(
        scenario.clockStart,
      )}) });`,
      '',
    );
  }

  if (needsNetwork) {
    // Registered before the first navigation so a request fired during initial
    // load is still observed.
    lines.push(
      '  const observedRequests: Array<{',
      '    method: string;',
      '    url: string;',
      '  }> = [];',
      '',
      "  page.on('request', request => {",
      '    observedRequests.push({',
      '      method: request.method(),',
      '      url: request.url(),',
      '    });',
      '  });',
      '',
    );
  }

  lines.push(`  await page.goto(${quote(scenario.startPath)});`, '');

  for (const step of scenario.steps) {
    lines.push(...compileStep(step), '');
  }

  scenario.assertions.forEach((assertion, index) => {
    lines.push(...compileAssertion(assertion, index), '');
  });

  lines.push('});', '');

  return lines.join('\n');
}
