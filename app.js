const events = [
  {id:'hackgrid',title:'HackGrid 2026: 24h Campus Hackathon',club:'IEEE Student Branch',category:'Hackathons',date:'Oct 24, 2026',time:'10:00 AM – Oct 25, 10:00 AM',venue:'Innovation & Incubation Lab',image:'/assets/event_hackathon_1793037313961.jpg',description:'Build boldly, collaborate with peers, and turn your sharpest ideas into a campus-ready prototype.',seats:'124 spots left',od:true},
  {id:'acoustic',title:'Acoustic Sunset: Autumn Indie Session',club:'Campus Cultural Guild',category:'Music',date:'Oct 29, 2026',time:'5:30 PM – 8:00 PM',venue:'Open Air Amphitheatre',image:'/assets/event_arts_music_1793037314690.jpg',description:'A warm evening of intimate live music, student artists, and a campus sunset worth slowing down for.',seats:'62 spots left',od:false},
  {id:'rover',title:'Autonomous Mobile Rover & LiDAR Bootcamp',club:'AI & Robotics Society (AIRS)',category:'Technology',date:'Nov 08, 2026',time:'9:00 AM – 4:30 PM',venue:'Design & Prototyping Studio',image:'/assets/event_robotics_1793037314638.jpg',description:'Build, sense, and navigate. A hands-on bootcamp for students who want to take robotics beyond the classroom.',seats:'38 spots left',od:true},
  {id:'venture',title:'VentureForge: Angel Pitch & Term Sheet Clinic',club:'E-Cell Entrepreneurship Hub',category:'Entrepreneurship',date:'Nov 12, 2026',time:'2:00 PM – 5:00 PM',venue:'Innovation & Incubation Lab',image:'/assets/hero_campus_life_1793037312856.jpg',description:'Bring your early-stage idea, pressure-test the story, and learn the language of a strong founder-investor conversation.',seats:'75 spots left',od:false},
  {id:'quantum',title:'NextGen Quantum Computing & Cryptography Symposium',club:'IEEE Student Branch',category:'Research',date:'Nov 18, 2026',time:'10:00 AM – 3:30 PM',venue:'Tech Seminar Hall 1',image:'/assets/event_hackathon_1793037313961.jpg',description:'A focused symposium for curious minds exploring the next chapter of computing, security, and applied research.',seats:'86 spots left',od:true},
  {id:'theatre',title:'Annual Inter-Collegiate Theatre & Mono-Act Festival',club:'Campus Cultural Guild',category:'Arts & Culture',date:'Nov 23, 2026',time:'4:00 PM – 8:30 PM',venue:'Dr. APJ Abdul Kalam Auditorium',image:'/assets/event_arts_music_1793037314690.jpg',description:'Stories, stagecraft, and student voices from across the region in one expressive evening.',seats:'110 spots left',od:false}
];
const clubs = [
  {name:'IEEE Student Branch',short:'IE',members:'486 members',type:'Technology & Research',description:'A student-led home for builders, researchers, and anyone curious about what comes next.'},
  {name:'Campus Cultural Guild',short:'CG',members:'372 members',type:'Arts & Culture',description:'Music, theatre, visual arts, and the little moments that make campus memorable.'},
  {name:'AI & Robotics Society (AIRS)',short:'AI',members:'214 members',type:'Technology',description:'Learn by making: autonomous systems, machine intelligence, and weekend build sessions.'},
  {name:'E-Cell Entrepreneurship Hub',short:'EC',members:'318 members',type:'Entrepreneurship',description:'A practical community for founders, operators, mentors, and ambitious first experiments.'},
  {name:'Women in Tech Campus',short:'WT',members:'156 members',type:'Community & Technology',description:'A welcoming peer network for women and allies building confidence in tech.'},
  {name:'Design Guild',short:'DG',members:'129 members',type:'Design & Product',description:'A studio-like community for thoughtful interfaces, research, and creative problem solving.'}
];
let state = {page:'landing', category:'All', query:'', registrations:['hackgrid','acoustic','rover'], persona:'STUDENT'};
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
function eventById(id){return events.find(event=>event.id===id);}
function navigate(page){
  state.page=page;
  $$('.page-view').forEach(view=>view.classList.toggle('is-visible', view.dataset.page===page));
  $$('.nav-link').forEach(link=>link.classList.toggle('is-active', link.dataset.nav===page));
  $('.site-header')?.classList.remove('menu-open');
  window.location.hash=page;
  window.scrollTo({top:0,behavior:'smooth'});
}
function eventCard(event){
  return `<article class="event-card" data-event-card data-title="${event.title.toLowerCase()}" data-club="${event.club.toLowerCase()}" data-category="${event.category}">
    <div class="event-image"><img src="${event.image}" alt="${event.title}" /><span class="event-tag">${event.category}</span></div>
    <div class="event-card-body"><small>${event.club}</small><h3>${event.title}</h3><p>${event.description}</p><div class="event-meta"><span>◷ ${event.date}</span><span>⌖ ${event.venue}</span></div><div class="event-actions"><span class="status-pill ${event.od?'success':'pending'}">${event.od?'OD-friendly':'Open registration'}</span><button class="button button-secondary" data-event="${event.id}">View details</button></div></div>
  </article>`;
}
function renderLandingEvents(){
  const filtered=events.filter(e=>state.category==='All'||e.category===state.category);
  $('#landing-events').innerHTML=filtered.slice(0,6).map(eventCard).join('');
}
function renderDiscover(){
  const select=$('#discover-category');
  if(select) select.value=state.category;
  const query=state.query.trim().toLowerCase();
  const filtered=events.filter(e=>(state.category==='All'||e.category===state.category)&&(!query||`${e.title} ${e.club} ${e.venue}`.toLowerCase().includes(query)));
  $('#result-count').textContent=`Showing ${filtered.length} of ${events.length} campus events`;
  $('#discover-events').innerHTML=filtered.length?filtered.map(eventCard).join(''):`<div class="empty-state"><h3>No events found</h3><p>Try another category or search phrase.</p></div>`;
}
function renderRegistrations(){
  const list=$('#registration-list');
  const registered=state.registrations.map(eventById).filter(Boolean);
  list.innerHTML=registered.map(event=>`<article class="registration-card"><div class="event-thumb"><img src="${event.image}" alt="${event.title}" /></div><div><span class="section-kicker">Confirmed registration</span><h3>${event.title}</h3><p>${event.club} · ${event.date} · ${event.venue}</p><div class="event-meta"><span class="status-pill ${event.od?'success':'pending'}">${event.od?'OD request approved':'Ticket ready'}</span><span>Registration ID CS-${event.id.slice(0,4).toUpperCase()}24</span></div></div><div class="registration-actions"><button class="button button-primary" data-ticket="${event.id}">View ticket</button><button class="text-button" data-action="cancel-registration" data-event-id="${event.id}">Cancel</button></div></article>`).join('');
}
function renderClubs(){
  const query=($('#club-search')?.value||'').toLowerCase();
  $('#club-grid').innerHTML=clubs.filter(c=>`${c.name} ${c.type}`.toLowerCase().includes(query)).map(club=>`<article class="club-card"><div class="club-top"><span class="club-logo">${club.short}</span><button class="club-follow">Follow +</button></div><h3>${club.name}</h3><p>${club.description}</p><footer><span>${club.type}</span><span>${club.members}</span></footer></article>`).join('');
}
function openEventModal(id){
  const event=eventById(id); if(!event)return;
  $('#modal-content').innerHTML=`<div class="modal-event-image"><img src="${event.image}" alt="${event.title}" /></div><span class="section-kicker">${event.club}</span><h2 id="modal-title">${event.title}</h2><p>${event.description}</p><div class="modal-detail-grid"><div class="detail-box"><span>Date & time</span><strong>${event.date}<br>${event.time}</strong></div><div class="detail-box"><span>Venue</span><strong>${event.venue}</strong></div><div class="detail-box"><span>Schedule fit</span><strong>${event.od?'Overlaps 2 classes · OD available':'No timetable conflict'}</strong></div><div class="detail-box"><span>Availability</span><strong>${event.seats}</strong></div></div><div class="modal-actions"><button class="button button-primary" data-action="register-event" data-event-id="${event.id}">${state.registrations.includes(event.id)?'Registered ✓':'Register & check fit'}</button><button class="button button-secondary" data-action="close-modal">Maybe later</button></div>`;
  $('#modal-backdrop').hidden=false;
}
function openTicketModal(id){
  const event=eventById(id); if(!event)return;
  $('#modal-content').innerHTML=`<span class="section-kicker">Digital entry pass</span><h2 id="modal-title">${event.title}</h2><p>Your registration is confirmed. Show this pass at the check-in desk.</p><div class="ticket-pass"><div class="ticket-qr">▦<small>CS-${event.id.slice(0,4).toUpperCase()}</small></div><div><strong>Priya Sharma</strong><span>22CS1042 · Student</span><span>${event.date} · ${event.time.split('–')[0]}</span><span>${event.venue}</span></div></div><div class="modal-actions"><button class="button button-primary" data-action="close-modal">Done</button></div>`;
  $('#modal-backdrop').hidden=false;
}
function openCreateModal(){
  $('#modal-content').innerHTML=`<span class="section-kicker">Organizer workspace</span><h2 id="modal-title">Create a campus event</h2><p>Build the event shell now. This frontend-only demo keeps the form local to your browser.</p><form id="create-event-form" class="create-form"><label>Event title<input required name="title" placeholder="e.g. Design Thinking Sprint" /></label><label>Category<select name="category"><option>Technology</option><option>Arts & Culture</option><option>Entrepreneurship</option><option>Research</option></select></label><label>Date<input required name="date" type="date" /></label><label>Venue<input required name="venue" placeholder="Venue or hall" /></label><button class="button button-primary" type="submit">Save draft</button></form>`;
  $('#modal-backdrop').hidden=false;
}
function registerEvent(id){
  if(!state.registrations.includes(id)) state.registrations.push(id);
  const event=eventById(id);
  $('#modal-content').innerHTML=`<div class="success-illustration">✓</div><span class="section-kicker">You’re on the list</span><h2 id="modal-title">Registration confirmed</h2><p><strong>${event.title}</strong> is now in your registrations. ${event.od?'Your On-Duty request has been prepared for DSA review.':'Your digital ticket is ready whenever you need it.'}</p><div class="modal-actions"><button class="button button-primary" data-ticket="${event.id}">View ticket</button><button class="button button-secondary" data-action="close-modal">Close</button></div>`;
  renderRegistrations();
}
function setPersona(role,target){
  state.persona=role;
  const labels={STUDENT:'Priya Sharma (STUDENT)',ORGANIZER:'Arjun Patel (ORGANIZER)',DSA:'Dr. Ramanathan (DSA)',ADMIN:'Campus Administrator (ADMIN)'};
  $('#persona-label').textContent=labels[role];
  $$('.role-button').forEach(button=>button.classList.toggle('is-active',button.dataset.role===role));
  const profile=$('.profile-copy strong');
  if(profile) profile.textContent=role==='STUDENT'?'Priya Sharma':role==='ORGANIZER'?'Arjun Patel':role==='DSA'?'Dr. V. Ramanathan':'Campus Administrator';
  navigate(target);
}
function bindDynamicEvents(){
  $$('[data-nav]').forEach(element=>element.addEventListener('click',()=>navigate(element.dataset.nav)));
  $$('[data-event]').forEach(element=>element.addEventListener('click',()=>openEventModal(element.dataset.event)));
  $$('[data-ticket]').forEach(element=>element.addEventListener('click',()=>openTicketModal(element.dataset.ticket)));
}

document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(event.target.closest('.mobile-menu')) $('.site-header')?.classList.toggle('menu-open');
  if(action==='close-modal') $('#modal-backdrop').hidden=true;
  if(action==='open-create') openCreateModal();
  if(action==='register-event') registerEvent(event.target.closest('[data-event-id]').dataset.eventId);
  if(action==='cancel-registration'){
    state.registrations=state.registrations.filter(id=>id!==event.target.closest('[data-event-id]').dataset.eventId);
    renderRegistrations();
  }
  const roleButton=event.target.closest('[data-role]');
  if(roleButton) setPersona(roleButton.dataset.role,roleButton.dataset.target);
  if(event.target.closest('.notification-trigger')) $('#notification-drawer').hidden=false;
  if(action==='close-notifications') $('#notification-drawer').hidden=true;
  if(action==='mark-read') $$('.notification').forEach(item=>item.classList.remove('unread'));
  const category=event.target.closest('[data-category]');
  if(category){state.category=category.dataset.category;$$('.filter-tab').forEach(tab=>tab.classList.toggle('is-active',tab===category));renderLandingEvents();}
  const tab=event.target.closest('.registration-tabs button');
  if(tab){$$('.registration-tabs button').forEach(item=>item.classList.remove('is-active'));tab.classList.add('is-active');}
});
document.addEventListener('input',event=>{
  if(event.target.id==='event-search'){state.query=event.target.value;renderDiscover();bindDynamicEvents();}
  if(event.target.id==='club-search') renderClubs();
});
document.addEventListener('change',event=>{
  if(event.target.id==='discover-category'){state.category=event.target.value;renderDiscover();bindDynamicEvents();}
});
document.addEventListener('submit',event=>{
  if(event.target.id==='create-event-form'){event.preventDefault();$('#modal-content').innerHTML='<div class="success-illustration">✓</div><span class="section-kicker">Draft saved</span><h2 id="modal-title">Event draft created</h2><p>Your event is ready for details and review. In a connected CampusSync deployment, this is where it would move into the approval queue.</p><div class="modal-actions"><button class="button button-primary" data-action="close-modal">Done</button></div>';}
});
$('#modal-backdrop').addEventListener('click',event=>{if(event.target.id==='modal-backdrop')event.currentTarget.hidden=true;});
window.addEventListener('hashchange',()=>{const page=window.location.hash.replace('#','');if(document.querySelector(`[data-page="${page}"]`))navigate(page);});
renderLandingEvents();renderDiscover();renderRegistrations();renderClubs();bindDynamicEvents();
const initial=window.location.hash.replace('#','');if(initial&&document.querySelector(`[data-page="${initial}"]`))navigate(initial);
