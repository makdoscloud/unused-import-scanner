#!/usr/bin/env node

import path from 'path';
import { UniversalUnusedFinder } from './finder';

const args = process.argv.slice(2);
const writeJson = args.includes('--json');

// Accept an optional directory argument: unusedfinder [path] [--json]
const pathArg = args.find((a) => !a.startsWith('-'));
const projectRoot = pathArg ? path.resolve(pathArg) : process.cwd();

const finder = new UniversalUnusedFinder({ projectRoot });
finder.printResults(writeJson);
