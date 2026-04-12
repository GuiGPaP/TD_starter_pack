## Node {{nodePath}}
- Type: `{{type}}` (ID: {{id}})
- Properties shown: {{displayed}} / {{total}}
{{#hasNonDefaultFilter}}
- {{nonDefaultSummary}}
{{/hasNonDefaultFilter}}
{{#hasFieldsFilter}}
- Filtered to: `{{filterFields}}`
{{/hasFieldsFilter}}

| Property | Value |
| --- | --- |
{{#properties}}| {{name}} | {{{value}}} |
{{/properties}}

{{#truncated}}_💡 {{omittedCount}} more properties omitted._{{/truncated}}
