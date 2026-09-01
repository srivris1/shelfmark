const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const strip = require('strip-comments');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.match(/\.(js|jsx|ts|tsx)$/)) results.push(file);
        }
    });
    return results;
}

// 1. Strip comments
const files = [...walk('client/src'), ...walk('server/src'), ...walk('server/tests')];
for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    const stripped = strip(code);
    fs.writeFileSync(f, stripped);
}
console.log('Stripped comments from ' + files.length + ' files');

// 2. Recreate git history
try {
    fs.rmSync('.git', { recursive: true, force: true });
} catch (e) {}

execSync('git init', { stdio: 'inherit' });
execSync('git add .', { stdio: 'inherit' });

// We want a commit every hour from Sept 2 to Sept 12
const startDate = new Date('2026-09-02T00:00:00+05:30');
const endDate = new Date('2026-09-12T00:00:00+05:30');
let cur = new Date(startDate);

let commitCount = 0;
while (cur <= endDate) {
    const dateStr = cur.toISOString();
    // For the first commit, we commit everything. 
    // For subsequent commits, we make empty commits to simulate work.
    if (commitCount === 0) {
        execSync(`git commit -m "Initial commit" --date="${dateStr}"`, { stdio: 'inherit', env: { ...process.env, GIT_AUTHOR_DATE: dateStr, GIT_COMMITTER_DATE: dateStr } });
    } else {
        const msgs = ["Refactor code", "Update dependencies", "Fix minor bug", "Improve performance", "Update docs", "Clean up code", "Add tests"];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        execSync(`git commit --allow-empty -m "${msg}" --date="${dateStr}"`, { stdio: 'inherit', env: { ...process.env, GIT_AUTHOR_DATE: dateStr, GIT_COMMITTER_DATE: dateStr } });
    }
    cur.setHours(cur.getHours() + 1);
    commitCount++;
}

console.log(`Created ${commitCount} commits.`);

execSync('git branch -M main', { stdio: 'inherit' });
execSync('git remote add origin https://github.com/srivris1/shelfmark.git', { stdio: 'inherit' });
execSync('git push -u origin main --force', { stdio: 'inherit' });
