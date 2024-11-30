<?php
/**
 * This file is part of the Passwords App
 * created by Marius David Wieschollek
 * and licensed under the AGPL.
 */

namespace OCA\Passwords\Migration;

use Exception;
use OCP\IUser;
use OC\Migration\SimpleOutput;
use PHPUnit\Framework\TestCase;
use OCA\Passwords\AppInfo\Application;
use PHPUnit\Framework\MockObject\MockObject;
use OCA\Passwords\AppInfo\SystemRequirements;
use OCA\Passwords\Services\ValidationService;
use OCA\Passwords\Helper\User\AdminUserHelper;
use OCA\Passwords\Services\NotificationService;
use OCA\Passwords\Services\BackgroundJobService;
use OCA\Passwords\Services\ConfigurationService;
use OCA\Passwords\Helper\AppSettings\ServiceSettingsHelper;

/**
 * Class CheckAppSettingsTest
 *
 * @package OCA\Passwords\Migration
 */
class CheckAppSettingsTest extends TestCase {

    /**
     * @var ValidationService
     */
    protected $checkAppSettings;

    /**
     * @var MockObject|AdminUserHelper
     */
    protected $adminHelper;

    /**
     * @var MockObject|ServiceSettingsHelper
     */
    protected $settingsHelper;

    /**
     * @var MockObject|NotificationService
     */
    protected $notificationService;

    /**
     * @var MockObject|ConfigurationService
     */
    protected $configurationService;

    /**
     * @var MockObject|BackgroundJobService
     */
    protected $backgroundService;

    /**
     *
     */
    protected function setUp(): void {
        $this->adminHelper = $this->createMock(AdminUserHelper::class);
        $this->settingsHelper = $this->createMock(ServiceSettingsHelper::class);
        $this->notificationService = $this->createMock(NotificationService::class);
        $this->configurationService = $this->createMock(ConfigurationService::class);
        $this->backgroundService = $this->createMock(BackgroundJobService::class);
        $this->checkAppSettings = new CheckAppSettings(
            $this->adminHelper, $this->configurationService, $this->notificationService, $this->settingsHelper, $this->backgroundService
        );
    }

    /**
     *
     */
    public function testGetName(): void {
        $this->assertEquals('Check app settings', $this->checkAppSettings->getName());
    }

    /**
     *
     */
    public function testRemoveOldDefaultFaviconApiUrl(): void {
        $this->setUpAdminHelper();
        $this->settingsHelper->expects($this->once())->method('reset')->with('favicon.api');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'bi']],
                ['favicon.api', ['value' => 'https://passwords-app-favicons.herokuapp.com/icon']],
                ['preview', ['value' => '']],
                ['preview.api', ['value' => 'value']],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testDoNotRemoveCustomFaviconApiUrl(): void {
        $this->setUpAdminHelper();
        $this->settingsHelper->expects($this->never())->method('reset');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'bi']],
                ['favicon.api', ['value' => 'https://my-besticon.herokuapp.com/icon']],
                ['preview', ['value' => '']],
                ['preview.api', ['value' => 'value']],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testIgnoreFaviconUrlIfBesticonNotUsed(): void {
        $this->setUpAdminHelper();
        $this->settingsHelper->expects($this->never())->method('reset');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => 'https://passwords-app-favicons.herokuapp.com/icon']],
                ['preview', ['value' => '']],
                ['preview.api', ['value' => 'value']],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSendNotificationIfPreviewApiMissing(): void {
        $this->setUpAdminHelper();
        $this->notificationService->expects($this->once())->method('sendEmptyRequiredSettingNotification')->with('admin', 'preview');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => 'test']],
                ['preview.api', ['value' => '', 'depends' => ['service.preview' => ['test']]]],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSendNoNotificationIfPreviewApiPresent(): void {
        $this->setUpAdminHelper();
        $this->notificationService->expects($this->never())->method('sendEmptyRequiredSettingNotification');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => 'test']],
                ['preview.api', ['value' => 'key', 'depends' => ['service.preview' => ['test']]]],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSendNotificationIfNextcloudOutdated(): void {
        $this->setUpAdminHelper();
        $this->notificationService
            ->expects($this->once())
            ->method('sendUpgradeRequiredNotification')
            ->with('admin', 0, PHP_VERSION_ID, '2022.1.0');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => '']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => '']],
                ['preview.api', ['value' => 'none']],
            ]
        );
        $this->configurationService->method('getAppValue')->willReturnMap(
            [
                ['installed_version', null, Application::APP_NAME, '2022.1.0'],
                ['nightly/enabled', null, Application::APP_NAME, '0'],
            ]
        );

        \OC_Util::$ncVersion =  [0,0,0,0];
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        } finally {
            \OC_Util::$ncVersion =  \OC_Util::$ncDefaultVersion;
        }
    }

    /**
     *
     */
    public function testSendNoNotificationIfNextcloudCurrent(): void {
        $this->setUpAdminHelper();
        $this->notificationService
            ->expects($this->never())
            ->method('sendUpgradeRequiredNotification');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => '']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => '']],
                ['preview.api', ['value' => 'none']],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSendNoNotificationIfPreviewApiNotRequired(): void {
        $this->setUpAdminHelper();
        $this->notificationService->expects($this->never())->method('sendEmptyRequiredSettingNotification');

        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => 'none']],
                ['preview.api', ['value' => '', 'depends' => ['service.preview' => ['test']]]],
            ]
        );
        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSetUpNightlyJobEnabled() {
        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => 'none']],
                ['preview.api', ['value' => '', 'depends' => ['service.preview' => []]]],
            ]
        );

        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        $this->configurationService->expects($this->once())->method('getAppValue')->with('nightly/enabled', '0')->willReturn('1');
        $this->backgroundService->expects($this->once())->method('addNightlyUpdates');

        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    public function testSetUpNightlyJobDisabled() {
        $this->settingsHelper->method('get')->willReturnMap(
            [
                ['favicon', ['value' => 'none']],
                ['favicon.api', ['value' => '']],
                ['preview', ['value' => 'none']],
                ['preview.api', ['value' => '', 'depends' => ['service.preview' => []]]],
            ]
        );

        $this->configurationService->method('getSystemValue')->with('version')->willReturn(SystemRequirements::NC_UPGRADE_MINIMUM.'.0.0.0');
        $this->configurationService->expects($this->once())->method('getAppValue')->with('nightly/enabled', '0')->willReturn('0');
        $this->backgroundService->expects($this->never())->method('addNightlyUpdates');

        try {
            $this->checkAppSettings->run(new SimpleOutput());
        } catch(Exception $e) {
            $this->fail($e->getMessage());
        }
    }

    /**
     *
     */
    protected function setUpAdminHelper(): void {
        $admin = $this->createMock(IUser::class);
        $admin->method('getUID')->willReturn('admin');

        $this->adminHelper->method('getAdmins')->willReturn([$admin]);
    }
}