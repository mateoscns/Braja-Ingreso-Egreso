package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.Fixture;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * What the simulation believes the system holds, kept independently of the server: companies, sites and their
 * configured geofence, template versions, assignments, tolerances, and for every declared jornada the schedule,
 * tolerance and geofence it must have frozen (CA3). Iteration orders are insertion orders, never hash orders (S8).
 */
final class SimWorld {
    static final ZoneId BUENOS_AIRES = ZoneId.of("America/Argentina/Buenos_Aires");
    static final ZoneId MENDOZA = ZoneId.of("America/Argentina/Mendoza");
    static final ZoneId SANTIAGO = ZoneId.of("America/Santiago");

    record Center(double latitude, double longitude, int radiusMeters) { }

    record Version(String name, List<Fixture.Block> blocks, int breakfastLimit, int lunchLimit) {
        /** Scheduled start and end on that local date: the first block's start and the last block's end in the site zone. */
        Instant[] window(LocalDate date, ZoneId zone) {
            Fixture.Block first = blocks.getFirst(), last = blocks.getLast();
            return new Instant[] {date.plusDays(first.startDayOffset()).atTime(first.start()).atZone(zone).toInstant(),
                    date.plusDays(last.endDayOffset()).atTime(last.end()).atZone(zone).toInstant()};
        }
    }

    static final class Company {
        final String name;
        final ZoneId zone;
        Fixture.Company fixture;
        /** The ADMIN who reviews the inbox at 18:00 (a second ADMIN in Braja, the same one in Andes). */
        ApiClient reviewer;
        String reviewerDni;
        String pushEndpoint;
        boolean subscribed;

        Company(String name, ZoneId zone) {
            this.name = name;
            this.zone = zone;
        }

        UUID id() { return fixture.id(); }

        ApiClient admin() { return fixture.admin(); }
    }

    static final class Site {
        final String code;
        final Company company;
        final ZoneId zone;
        UUID id;
        double shopLatitude, shopLongitude;
        Center center;

        Site(String code, Company company, ZoneId zone, double latitude, double longitude) {
            this.code = code;
            this.company = company;
            this.zone = zone;
            this.shopLatitude = latitude;
            this.shopLongitude = longitude;
        }
    }

    static final class Template {
        final String code;
        final Site site;
        UUID id;
        Version version;

        Template(String code, Site site, Version version) {
            this.code = code;
            this.site = site;
            this.version = version;
        }
    }

    /** One employee row: an account's membership in one company. */
    static final class Membership {
        final Company company;
        final List<Site> sites;
        UUID employeeId;
        int tolerance;
        boolean active = true;
        final Map<Site, NavigableMap<LocalDate, Template>> assignments = new LinkedHashMap<>();
        final Map<Site, Set<Integer>> weekdays = new LinkedHashMap<>();

        Membership(Company company, List<Site> sites, int tolerance) {
            this.company = company;
            this.sites = sites;
            this.tolerance = tolerance;
        }

        Template inForce(Site site, LocalDate date) {
            NavigableMap<LocalDate, Template> byDate = assignments.get(site);
            Map.Entry<LocalDate, Template> entry = byDate == null ? null : byDate.floorEntry(date);
            return entry == null ? null : entry.getValue();
        }
    }

    static final class Employee {
        final int index;
        final String name;
        final Persona persona;
        final Map<Company, Membership> memberships = new LinkedHashMap<>();
        final List<ApiClient> browsers = new ArrayList<>();
        String dni;
        UUID accountId;
        String password = Fixture.PASSWORD;
        String temporaryPassword;
        Company activeCompany;

        Employee(int index, String name, Persona persona) {
            this.index = index;
            this.name = name;
            this.persona = persona;
        }

        String tag() { return String.format("e%02d-%s(%s)", index, name, persona); }

        ApiClient browser() { return browsers.getFirst(); }

        Membership membership(Site site) { return memberships.get(site.company); }

        Company home() { return memberships.keySet().iterator().next(); }
    }

    static final class Jornada {
        final UUID id;
        final Employee employee;
        final Site site;
        final LocalDate date;
        final Template template;
        final Version version;
        final int tolerance;
        final Center center;
        final Instant start, end;
        boolean cancelled;

        Jornada(UUID id, Employee employee, Site site, LocalDate date, Template template, int tolerance) {
            this.id = id;
            this.employee = employee;
            this.site = site;
            this.date = date;
            this.template = template;
            this.version = template.version;
            this.tolerance = tolerance;
            this.center = site.center;
            Instant[] window = version.window(date, site.zone);
            this.start = window[0];
            this.end = window[1];
        }

        String tag() { return employee.tag() + "@" + site.code + " " + date; }
    }

    final List<Company> companies = new ArrayList<>();
    final List<Site> sites = new ArrayList<>();
    final Map<String, Template> templates = new LinkedHashMap<>();
    final List<Employee> employees = new ArrayList<>();
    final Map<UUID, Jornada> jornadas = new LinkedHashMap<>();
    private final Map<String, Jornada> live = new TreeMap<>();
    private final Map<UUID, Employee> byEmployeeId = new LinkedHashMap<>();

    Site site(String code) {
        return sites.stream().filter(site -> site.code.equals(code)).findFirst().orElseThrow();
    }

    Template template(String code) {
        Template template = templates.get(code);
        if (template == null) throw new IllegalArgumentException("unknown template " + code);
        return template;
    }

    void register(Employee employee, Membership membership) {
        byEmployeeId.put(membership.employeeId, employee);
    }

    Employee employeeById(UUID employeeId) {
        return byEmployeeId.get(employeeId);
    }

    void add(Jornada jornada) {
        jornadas.put(jornada.id, jornada);
        live.put(key(jornada.employee, jornada.site, jornada.date), jornada);
    }

    void cancel(Jornada jornada) {
        jornada.cancelled = true;
        live.remove(key(jornada.employee, jornada.site, jornada.date), jornada);
    }

    Jornada live(Employee employee, Site site, LocalDate date) {
        return live.get(key(employee, site, date));
    }

    /** Live jornadas of that local date, ordered by employee index and site. */
    List<Jornada> liveOn(LocalDate date) {
        List<Jornada> found = new ArrayList<>();
        for (Employee employee : employees) {
            for (Site site : sites) {
                Jornada jornada = live(employee, site, date);
                if (jornada != null) found.add(jornada);
            }
        }
        return found;
    }

    private static String key(Employee employee, Site site, LocalDate date) {
        return String.format("%02d|%s|%s", employee.index, site.code, date);
    }
}
