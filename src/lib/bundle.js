// Bundle sentences at build time. Uses the same rules file the basket page loads, so the
// home page, product page and basket can never disagree.
import vm from 'node:vm';
import rules from '../../public/js/bundle.js?raw';
import catalogue from '../data/products.json';
import strings from '../data/strings.json';

const ctx = { window: {} };
vm.runInNewContext(rules, ctx);
const cat = { ...catalogue, bundleText: strings.bundle };
export const bundleLine = ctx.window.AHBundle.line(cat);
export const bundleConditions = ctx.window.AHBundle.conditions(cat);
export const onSale = (p) => p.status !== 'coming-soon';
