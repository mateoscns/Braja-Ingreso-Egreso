package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.Fixture;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Builds Braja (Buenos Aires and Mendoza, two ADMINs) and Andes (Santiago), nine templates, twenty employees (one of
 * them in both companies) and the first assignments and bulk declaration. Companies and the second ADMIN are seeded in
 * SQL (no endpoint creates them); most employees too, with one cached BCrypt hash; two employees and the second
 * company's membership of the shared account go through the API, so that path is exercised as well.
 */
final class WorldSetup {
    /** One person's place in the roster: site code, ISO weekdays and either a fixed template or a weekly rotation. */
    record Work(String site, Set<Integer> weekdays, List<String> templates) { }

    record Person(String name, Persona persona, int tolerance, List<Work> work, boolean viaApi) { }

    static final Set<Integer> EVERY_DAY = Set.of(1, 2, 3, 4, 5, 6, 7);
    static final List<String> BA_ROTATION = List.of("BA-M", "BA-T", "BA-C");
    static final List<String> MZA_ROTATION = List.of("MZA-M", "MZA-I", "MZA-T");
    static final List<String> SCL_ROTATION = List.of("SCL-M", "SCL-T");

    static final List<Person> ROSTER = List.of(
            new Person("Ana", Persona.PUNCTUAL, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), true),
            new Person("Bruno", Persona.LATE, 5, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Carla", Persona.ABSENT, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Diego", Persona.FORGETFUL, 15, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Elena", Persona.SPAMMER, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Facundo", Persona.DOUBLE_TAP, 5, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Gabriela", Persona.OFFLINE_RETRY, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Hernán", Persona.NO_GPS, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Inés", Persona.OUTSIDE, 15, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Julián", Persona.MALICIOUS, 10, List.of(new Work("BA", EVERY_DAY, BA_ROTATION)), false),
            new Person("Karina", Persona.PUNCTUAL, 10, List.of(new Work("MZA", EVERY_DAY, MZA_ROTATION)), true),
            new Person("Lucas", Persona.BREAK_ABUSER, 5, List.of(new Work("MZA", EVERY_DAY, MZA_ROTATION)), false),
            new Person("Marina", Persona.LATE, 10, List.of(new Work("MZA", EVERY_DAY, MZA_ROTATION)), false),
            new Person("Nicolás", Persona.MULTI_SITE, 10, List.of(new Work("MZA", Set.of(1, 3, 5, 7), MZA_ROTATION),
                    new Work("BA", Set.of(2, 4, 6, 7), List.of("BA-C"))), false),
            new Person("Olga", Persona.EARLY_EGRESS, 10, List.of(new Work("MZA", EVERY_DAY, MZA_ROTATION)), false),
            new Person("Pablo", Persona.PUNCTUAL, 10, List.of(new Work("SCL", EVERY_DAY, List.of("SCL-N"))), false),
            new Person("Quimey", Persona.NIGHT_SHIFT, 15, List.of(new Work("SCL", EVERY_DAY, List.of("SCL-N"))), false),
            new Person("Rocío", Persona.PUNCTUAL, 10, List.of(new Work("SCL", EVERY_DAY, SCL_ROTATION)), false),
            new Person("Sofía", Persona.LATE_LOCATION, 5, List.of(new Work("SCL", EVERY_DAY, SCL_ROTATION)), false),
            new Person("Tomás", Persona.MULTI_COMPANY, 10, List.of(new Work("SCL", Set.of(1, 2, 3, 4, 5), SCL_ROTATION),
                    new Work("BA", Set.of(6), List.of("BA-T"))), false));

    static final int VICTIM = 0, MALICIOUS = 9, DEACTIVATED = 17, SHARED = 19;

    private final SimContext ctx;
    private final Map<Integer, EmployeeActor> actors;

    WorldSetup(SimContext ctx, Map<Integer, EmployeeActor> actors) {
        this.ctx = ctx;
        this.actors = actors;
    }

    void build() {
        SimWorld world = ctx.world;
        SimWorld.Company braja = new SimWorld.Company("Braja", SimWorld.BUENOS_AIRES);
        SimWorld.Company andes = new SimWorld.Company("Andes", SimWorld.SANTIAGO);
        world.companies.addAll(List.of(braja, andes));
        for (SimWorld.Company company : world.companies) {
            company.fixture = ctx.fixture.company(company.name);
            company.reviewer = company.admin();
            company.reviewerDni = company.fixture.adminDni();
        }
        braja.reviewerDni = Fixture.nextDni();
        seedAccount(UUID.randomUUID(), braja.reviewerDni, braja, "ADMIN", "Revisora Braja");
        braja.reviewer = ctx.client("admin2:Braja");
        braja.reviewer.login(braja.reviewerDni, Fixture.PASSWORD).expect(200);

        world.sites.add(new SimWorld.Site("BA", braja, SimWorld.BUENOS_AIRES, -34.6037, -58.3816));
        world.sites.add(new SimWorld.Site("MZA", braja, SimWorld.MENDOZA, -32.8895, -68.8458));
        world.sites.add(new SimWorld.Site("SCL", andes, SimWorld.SANTIAGO, -33.4489, -70.6693));
        Map<String, String> names = Map.of("BA", "Centro", "MZA", "Mendoza", "SCL", "Santiago");
        for (SimWorld.Site site : world.sites) site.id = ctx.fixture.site(site.company.fixture, names.get(site.code), site.zone.getId());
        ctx.admin.siteCenter(world.site("BA"), new SimWorld.Center(-34.6037, -58.3816, 100));
        ctx.admin.siteCenter(world.site("SCL"), new SimWorld.Center(-33.4489, -70.6693, 120));

        template("BA-M", "BA", "Mañana", 15, 30, Fixture.Block.sameDay("07:00", "15:00"));
        template("BA-T", "BA", "Tarde", 15, 30, Fixture.Block.sameDay("14:00", "22:00"));
        template("BA-C", "BA", "Cortado", 20, 60, Fixture.Block.sameDay("09:00", "13:00"), Fixture.Block.sameDay("14:00", "18:00"));
        template("MZA-M", "MZA", "Mañana", 20, 45, Fixture.Block.sameDay("07:00", "15:00"));
        template("MZA-I", "MZA", "Intermedio", 15, 30, Fixture.Block.sameDay("10:00", "18:00"));
        template("MZA-T", "MZA", "Tarde", 15, 45, Fixture.Block.sameDay("14:00", "22:00"));
        template("SCL-M", "SCL", "Mañana", 15, 30, Fixture.Block.sameDay("07:00", "15:00"));
        template("SCL-T", "SCL", "Tarde", 15, 30, Fixture.Block.sameDay("14:00", "22:00"));
        template("SCL-N", "SCL", "Noche", 20, 30, Fixture.Block.overnight("22:00", "06:00"));

        for (int i = 0; i < ROSTER.size(); i++) person(i, ROSTER.get(i));
        SimWorld.Employee ana = world.employees.get(VICTIM);
        ApiClient tablet = ctx.client(ana.tag() + "/tablet");
        tablet.login(ana.dni, Fixture.PASSWORD).expect(200);
        ana.browsers.add(tablet);
        for (SimWorld.Company company : world.companies) ctx.admin.subscribe(company);
    }

    private void template(String code, String siteCode, String name, int breakfast, int lunch, Fixture.Block... blocks) {
        SimWorld.Site site = ctx.world.site(siteCode);
        SimWorld.Template template = new SimWorld.Template(code, site, new SimWorld.Version(name, List.of(blocks), breakfast, lunch));
        template.id = ctx.fixture.template(site.company.fixture, site.id, name, List.of(blocks), breakfast, lunch);
        ctx.world.templates.put(code, template);
    }

    private void person(int index, Person person) {
        SimWorld world = ctx.world;
        SimWorld.Employee employee = new SimWorld.Employee(index, person.name(), person.persona());
        world.employees.add(employee);
        Map<SimWorld.Company, List<Work>> byCompany = new LinkedHashMap<>();
        for (Work work : person.work()) byCompany.computeIfAbsent(world.site(work.site()).company, c -> new ArrayList<>()).add(work);
        boolean first = true;
        for (Map.Entry<SimWorld.Company, List<Work>> entry : byCompany.entrySet()) {
            SimWorld.Company company = entry.getKey();
            List<SimWorld.Site> sites = entry.getValue().stream().map(work -> world.site(work.site())).toList();
            SimWorld.Membership membership = new SimWorld.Membership(company, sites, person.tolerance());
            for (Work work : entry.getValue()) membership.weekdays.put(world.site(work.site()), work.weekdays());
            List<UUID> siteIds = sites.stream().map(site -> site.id).toList();
            if (first && person.viaApi()) {
                Fixture.Employee created = ctx.fixture.employee(company.fixture, person.name(), siteIds, person.tolerance());
                employee.dni = created.dni();
                employee.accountId = created.accountId();
                employee.browsers.add(created.client());
                membership.employeeId = created.id();
            } else if (first) {
                employee.dni = Fixture.nextDni();
                employee.accountId = UUID.randomUUID();
                membership.employeeId = seedEmployee(employee, company, siteIds, person.tolerance());
                ApiClient phone = ctx.client(employee.tag() + "/phone");
                phone.login(employee.dni, Fixture.PASSWORD).expect(200);
                employee.browsers.add(phone);
            } else {
                // An existing account added to a second company through the ADMIN API (D-20261016-01).
                membership.employeeId = company.admin().post("/api/v1/employees", Map.of("dni", employee.dni, "displayName", person.name(),
                        "siteIds", siteIds, "toleranceMinutes", person.tolerance())).expect(201).id();
            }
            employee.memberships.put(company, membership);
            world.register(employee, membership);
            first = false;
        }
        employee.activeCompany = employee.home();
        actors.put(index, new EmployeeActor(ctx, employee));
    }

    private UUID seedEmployee(SimWorld.Employee employee, SimWorld.Company company, List<UUID> siteIds, int tolerance) {
        UUID employeeId = UUID.randomUUID();
        Timestamp now = Timestamp.from(ctx.now());
        seedAccount(employee.accountId, employee.dni, company, "EMPLOYEE", null);
        ctx.jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,TRUE,?,?)",
                employeeId.toString(), company.id().toString(), employee.accountId.toString(), employee.name, tolerance, now, now);
        for (UUID site : siteIds) {
            ctx.jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                    company.id().toString(), employeeId.toString(), site.toString(), now);
        }
        return employeeId;
    }

    private void seedAccount(UUID accountId, String dni, SimWorld.Company company, String role, String displayName) {
        Timestamp now = Timestamp.from(ctx.now());
        ctx.jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), dni, dni, ctx.passwordHash, now, now);
        ctx.jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name) VALUES(?,?,?,?,TRUE,?,?)",
                UUID.randomUUID().toString(), company.id().toString(), accountId.toString(), role, now, displayName);
    }

    /** Weekly assignments for the Mondays of a block (every person's rotation), the fixed ones on the first day, then the bulk. */
    void declareBlock(LocalDate from, LocalDate to, boolean duplicateOne) {
        SimWorld world = ctx.world;
        for (SimWorld.Employee employee : world.employees) {
            for (Work work : ROSTER.get(employee.index).work()) {
                SimWorld.Site site = world.site(work.site());
                for (LocalDate monday = from; !monday.isAfter(to); monday = monday.plusDays(1)) {
                    boolean blockStart = monday.equals(SimSettings.FIRST_DAY);
                    if (monday.getDayOfWeek().getValue() != 1 || (work.templates().size() == 1 && !blockStart)) continue;
                    int week = (int) ChronoUnit.WEEKS.between(SimSettings.FIRST_DAY, monday);
                    String code = work.templates().get((employee.index + week) % work.templates().size());
                    ctx.admin.assign(employee, site, world.template(code), monday);
                }
            }
        }
        if (duplicateOne) {
            SimWorld.Employee bruno = world.employees.get(1);
            LocalDate monday = bruno.membership(world.site("BA")).assignments.get(world.site("BA")).lastKey();
            ctx.admin.assign(bruno, world.site("BA"), world.template("BA-M"), monday);
        }
        for (SimWorld.Site site : world.sites) bulkSite(site, from, to, employee -> true);
    }

    /** One bulk per site and weekday set (a bulk carries one weekday set for all its employees). */
    void bulkSite(SimWorld.Site site, LocalDate from, LocalDate to, java.util.function.Predicate<SimWorld.Employee> include) {
        Map<Set<Integer>, List<SimWorld.Employee>> groups = new LinkedHashMap<>();
        for (SimWorld.Employee employee : ctx.world.employees) {
            SimWorld.Membership membership = employee.membership(site);
            if (membership == null || !membership.sites.contains(site) || !include.test(employee)) continue;
            groups.computeIfAbsent(membership.weekdays.get(site), k -> new ArrayList<>()).add(employee);
        }
        groups.forEach((weekdays, employees) -> ctx.admin.bulk(site, employees, weekdays, from, to));
    }
}
