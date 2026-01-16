## Notes
Secure cofounder

Working remotely with GitHub
Changelog.md update sign and date all changes. Checking out branches. 

Create company doc for onboarding and investment info

## Currently Bridge does the following:
- Generates list of outdated packages and prioritizes them
- Lists unused dependencies
- Auto generates PR with patch/minor updates
## Next 
- [ ] Update documentation - setting up github app
- [ ] Automated updates - options for daily/weekly updates
- [ ] Dependabot signaling - use dependabot notifications to inform package updates.
- [ ] Automations tab - set automation frequency for: scans, patch updates, reports (reports feature coming soon, still being planned), etc. 

### Small Changes
- [x] Change 'agents' tab to 'automations' 
- [x] Remove ALL emojis from UI, docs, and comments
- [x] Change title fonts to OCR-A (font is currently placed in 'components' move it to wherever is best)
- [ ] 


## Future
- [ ] Moving the whole build over to Electron as a desktop app
- [ ] Github rate limits - at what point to I run into Github rate limits?
- [ ] API cost calculation - how much will it cost to incorporate various LLMs for features like scoring and insights?
- [ ] Payment processing - As an enterprise SaaS app, I will need a way to take payments
- [ ] 'Organization focus and goals' - Creating a "profile" for organizations based on their goals. Build and ship fast, fix the debt later (highly technically leveraged, usually startups) Maintain legacy code, fix old stuff (usually older companies just maintaining what they already have established.) This information will be used to better inform Bridge to create better insights and recommendations. 
- [ ] Improve scoring/grading algorithm
- [ ] Send Slack reports (daily or weely) with an overview of organizations tech debt, priorities, concerns, etc. This will be customizable by the org to show what they feel is most important. 