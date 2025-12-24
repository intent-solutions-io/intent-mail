/**
 * Rules Parser
 *
 * YAML parsing and validation for IntentMail rules-as-code.
 * Based on: completed-docs/intent-mail/000-docs/262-AT-DSGN-rules-as-code-spec.md
 */

import { readFile } from 'fs/promises';
import { load as parseYaml } from 'js-yaml';
import { ZodError } from 'zod';
import { Rule, RuleSchema } from './types.js';

/**
 * Error thrown when rule parsing fails
 */
export class RuleParseError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'RuleParseError';
  }
}

/**
 * Parse YAML string into validated Rule object
 *
 * @param yaml - YAML string containing rule definition
 * @returns Validated Rule object
 * @throws RuleParseError if YAML is invalid or rule fails validation
 *
 * @example
 * ```typescript
 * const rule = parseRule(`
 * version: 1
 * name: "Archive newsletters"
 * enabled: true
 * conditions:
 *   - field: from
 *     operator: contains
 *     value: "@newsletter"
 * actions:
 *   - type: apply_label
 *     label: "newsletters"
 *   - type: archive
 * `);
 * ```
 */
export function parseRule(yaml: string): Rule {
  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (error) {
    throw new RuleParseError(
      'Invalid YAML syntax',
      'YAML_PARSE_ERROR',
      error
    );
  }

  // Validate against schema
  try {
    return RuleSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.errors.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });

      throw new RuleParseError(
        `Rule validation failed:\n${messages.join('\n')}`,
        'RULE_VALIDATION_ERROR',
        error
      );
    }
    throw error;
  }
}

/**
 * Parse rule from YAML file
 *
 * @param filePath - Path to YAML file
 * @returns Validated Rule object
 * @throws RuleParseError if file cannot be read or rule is invalid
 *
 * @example
 * ```typescript
 * const rule = await parseRuleFromFile('./rules/archive-newsletters.yaml');
 * console.log(`Loaded rule: ${rule.name}`);
 * ```
 */
export async function parseRuleFromFile(filePath: string): Promise<Rule> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseRule(content);
  } catch (error) {
    if (error instanceof RuleParseError) {
      throw error; // Re-throw parse errors as-is
    }

    throw new RuleParseError(
      `Failed to read rule file: ${filePath}`,
      'FILE_READ_ERROR',
      error
    );
  }
}

/**
 * Parse multiple rules from YAML file containing array of rules
 *
 * @param filePath - Path to YAML file with rule array
 * @returns Array of validated Rule objects
 * @throws RuleParseError if file cannot be read or any rule is invalid
 *
 * @example
 * ```typescript
 * // rules.yaml:
 * // - version: 1
 * //   name: "Rule 1"
 * //   ...
 * // - version: 1
 * //   name: "Rule 2"
 * //   ...
 *
 * const rules = await parseRulesFromFile('./rules/all-rules.yaml');
 * console.log(`Loaded ${rules.length} rules`);
 * ```
 */
export async function parseRulesFromFile(filePath: string): Promise<Rule[]> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseYaml(content);

    if (!Array.isArray(parsed)) {
      throw new RuleParseError(
        'Expected array of rules in YAML file',
        'INVALID_RULES_ARRAY',
        new Error('Parsed YAML is not an array')
      );
    }

    // Validate each rule individually for better error messages
    const rules: Rule[] = [];
    for (let i = 0; i < parsed.length; i++) {
      try {
        const rule = RuleSchema.parse(parsed[i]);
        rules.push(rule);
      } catch (error) {
        if (error instanceof ZodError) {
          const messages = error.errors.map((err) => {
            const path = err.path.join('.');
            return `  ${path}: ${err.message}`;
          });

          throw new RuleParseError(
            `Rule validation failed at index ${i}:\n${messages.join('\n')}`,
            'RULE_VALIDATION_ERROR',
            error
          );
        }
        throw error;
      }
    }

    return rules;
  } catch (error) {
    if (error instanceof RuleParseError) {
      throw error;
    }

    throw new RuleParseError(
      `Failed to read rules file: ${filePath}`,
      'FILE_READ_ERROR',
      error
    );
  }
}
