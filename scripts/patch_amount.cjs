const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');

const from = "            input.focus();\n            input.value = String(amount);\n            input.dispatchEvent(new Event(\"input\", { bubbles: true }));\n            input.dispatchEvent(new Event(\"change\", { bubbles: true }));\n            input.blur();";
const to = [
"            input.focus();",
"            // The investment field is a React-controlled input: assigning .value",
"            // directly is silently ignored by React's value tracker (the UI keeps the",
"            // old amount and the trade goes through with whatever was there). The",
"            // native prototype setter + bubbling input event is what React hears.",
"            const proto = input instanceof window.HTMLTextAreaElement",
"              ? window.HTMLTextAreaElement.prototype",
"              : window.HTMLInputElement.prototype;",
"            const valSetter = Object.getOwnPropertyDescriptor(proto, \"value\").set;",
"            if (valSetter) valSetter.call(input, String(amount));",
"            else input.value = String(amount);",
"            input.dispatchEvent(new Event(\"input\", { bubbles: true }));",
"            input.dispatchEvent(new Event(\"change\", { bubbles: true }));",
"            input.blur();"
].join('\n');
const i = s.indexOf(from);
if (i === -1) throw new Error('amount block not found');
s = s.slice(0, i) + to + s.slice(i + from.length);
fs.writeFileSync(f, s);
console.log('amount setter patched');
